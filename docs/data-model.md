# Data model

PostgreSQL stores all persistent data. Models live in `backend/apps/scans/models.py` and `backend/apps/accounts/models.py`; tables are prefixed `scans_` and `accounts_`.

## Entities

| Model | Description | Key fields |
|---|---|---|
| `Target` | saved scan target | `address`, `target_type` (`ip` / `cidr` / `domain`), `comment` |
| `TargetGroup` | named group of targets; a target can be in several groups | `name`, `description`, `targets` |
| `GroupSchedule` | scan schedule of a group (at most one per group) | `frequency`, `interval_hours`, `time_of_day`, `weekday`, `modules_snapshot`, `next_run_at`, `last_status` |
| `AllowlistEntry` | approved scan scope | `value`, `entry_type`, `enabled`, `comment` |
| `ScanRun` | one scan run | `status`, `modules_snapshot`, `window_seconds`, `deadline_at`, `progress`, `eta_seconds`, `resume_available`, `result_summary`, `defectdojo_export_status` |
| `ScanBatch` | unit of work: one target in a run | `target_address`, `target_type`, `delivery_id`, `status`, `progress`, `result`, `error` |
| `ScanEvent` | activity console entry | `level`, `source`, `message` |
| `Observation` | normalized result | `entity_type`, `entity_key`, `lifecycle`, `attrs`, `source`, `miss_streak` |
| `FingerprintEvidence` | evidence for an observation | `kind`, `summary`, `ciphertext` (AES-256-GCM) |
| `ManualOverride` | persistent user correction | `entity_key`, `tags`, `notes_ciphertext`, `attrs_patch`, `updated_by` |
| `AuditLog` | audit trail | `actor`, `action`, `object_type`, `object_id`, `summary` |
| `QueueState` | broker epoch, used to detect Redis data loss | `broker_epoch` |
| `UserProfile` | role and MFA settings (extends `auth.User`) | `role`, `mfa_enabled`, `mfa_secret` |

Signatures are not stored in the database. They are YAML files in `signatures/` ([signatures.md](signatures.md)).

Data is shared across users: `owner` records the author, but every role sees the same targets, groups, scans and results.

## Run and batch states

`ScanRun.status`: `queued` → `running` → `completed` | `partial` | `failed` | `cancelled`. `cancel_requested` marks a cancellation in progress.

`ScanBatch.status`: `queued`, `running`, `completed`, `failed`, `cancelled`, `paused`. The end of the time window sets `paused`. A run with paused batches is `partial` with `resume_available = true`.

`modules_snapshot` stores the module configuration at start, so changes mid-scan apply from the next run. The nmap mode (`syn` / `connect`) and the full nmap and httpx command lines are stored in `ScanBatch.result.metadata`.

## Observations

Each observation belongs to one run and has a logical key that is stable across runs:

| `entity_type` | `entity_key` | Example `attrs` |
|---|---|---|
| `host` | `host:<address>` | `address`, `status` |
| `port` | `port:<address>:<protocol>/<port>` | `service`, `product`, `version`, `state`, `curiosity` |
| `http` | `http:<url>` | `status_code`, `title`, `server`, `interesting_headers`, `security_headers_missing`, `cookies`, `cookie_tech` |
| `tech` | `tech:<url>:<technology>` | `technology`, `confidence` |
| `cert` | `cert:<url>:<subject>` | subject, issuer, validity |
| `signature` | `signature:<endpoint>:<technology>` | `signature_id`, `confidence`, `level`, `version`, `evidence` |
| `host` (passive) | `passive:<query>` | RDAP data and Certificate Transparency names |

The pair (`run`, `entity_key`) is unique. `source` is `scanner` (worker result) or `import` (loaded from a JSON file).

## Immutable observations, persistent overrides

Users never edit scanner or imported results. A correction goes into a `ManualOverride` pinned to `entity_key`:

```text
UI view = observation ⊕ active override (tags, note, attribute patches)
```

The next scan creates a new observation with the same key, so the override stays attached. Overrides are shared; if a key has several, the newest wins.

## Lifecycle

When a run finishes, the API compares its observations with the **previous completed run with the same modules and the same group** (for scans without a group: the same target list).

| State | Condition |
|---|---|
| `NEW` | key absent from the reference run (or no reference run) |
| `CHANGED` | key exists, attributes differ |
| `UNCHANGED` | key exists, attributes identical |
| `FLAKY` | observation came back after `MISSING` / `FLAKY` / `GONE`, or is missing for the second time in a row |
| `MISSING` | absent in the first full run |
| `GONE` | absent in the third and later full runs |

For absent observations the API creates a record in the current run with carried-over attributes and `miss_streak` increased by 1. `MISSING` / `FLAKY` / `GONE` are produced only when the run is `completed`; a partial, cancelled or failed run never lowers a state.

State counts go to `ScanRun.result_summary.lifecycle`, and the curiosity summary to `result_summary.curiosity`.

## Worker to API

The worker has no database access. It posts a result to `/api/internal/batches/{id}/complete/`, and the API:

1. authenticates the service token (`X-Worker-Token`) and checks `delivery_id`;
2. rejects results for batches paused by the time window (HTTP 409);
3. stores the result in `ScanBatch.result` and creates observations;
4. encrypts evidence (`FingerprintEvidence.ciphertext`);
5. when the run finishes, computes lifecycle states and triggers the DefectDojo export.
