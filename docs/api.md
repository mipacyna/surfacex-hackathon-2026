# API

The public API is available only through the gateway (`/api/…`). Workers use separate `/api/internal/…` endpoints with an `X-Worker-Token` header.

Authentication is session-based (cookie, optional `X-Sessionid` header). No session returns `401`, missing permission returns `403`. CSRF protection is enabled with `CSRF_PROTECT=1` (off by default for local use).

Data is shared: any logged-in role can read targets, groups, scans, results and the allowlist. The "Roles" column says who may perform the operation.

## Auth

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/api/auth/csrf/` | public | sets the CSRF cookie |
| POST | `/api/auth/login/` | public | log in; may require MFA |
| POST | `/api/auth/mfa/verify/` | public | verify a TOTP code |
| POST | `/api/auth/logout/` | logged in | log out |
| GET | `/api/auth/me/` | logged in | current user and role |
| GET/POST | `/api/auth/users/` | admin | list / create users |
| PATCH/DELETE | `/api/auth/users/{id}/` | admin | change role, password or status |

## Targets and groups

| Method | Path | Roles | Description |
|---|---|---|---|
| GET/POST | `/api/targets/` | read: all; write: admin/operator | list (filters `?search=`, `?group=`, `?limit=1..100`) / add a target |
| DELETE | `/api/targets/{id}/` | admin/operator | delete (targets cannot be edited) |
| POST | `/api/targets/import/` | admin/operator | import TXT/CSV/JSON (10,000 targets, 5 MiB) |
| GET/POST | `/api/groups/` | read: all; write: admin/operator | groups |
| GET/PATCH/DELETE | `/api/groups/{id}/` | same | group details |
| POST | `/api/groups/{id}/targets/` | admin/operator | `{action: "add"\|"remove", target_ids: []}` |
| POST | `/api/groups/{id}/scan/` | admin/operator | scan the whole group (`modules`, `client_request_id`, optional `window_seconds`) |
| PUT/DELETE | `/api/groups/{id}/schedule/` | admin/operator | set / remove the schedule |

Every target in responses carries `groups: [{id, name}]`; every scan carries `group_id`, `group_name` and `scheduled`. Deleting a group keeps its hosts and past scans.

## Passive discovery

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/api/passive/discover/` | admin/operator | `{"query":"example.com"}` or an IP: subdomains (crt.sh) and an RDAP summary; cached in Redis for 15 min; never starts a scan |

Response fields: `query`, `type` (`domain`/`ip`), `subdomains`, `rdap` (or `null`), `sources` (`ok` / `error` / `not_applicable`), `warnings`, `cached`. A failure of one source does not block the other. The endpoint stores nothing; the normal path is the `passive-discovery` scan module ([scanning-policy.md](scanning-policy.md#passive-discovery)).

## Scans and results

| Method | Path | Roles | Description |
|---|---|---|---|
| GET/POST | `/api/scans/` | read: all; start: admin/operator | list / start (`target_ids`, `modules`, optional `window_seconds`) |
| GET | `/api/scans/{id}/` | all | details, events, batches, ETA |
| POST | `/api/scans/{id}/cancel/` | admin/operator | cancel |
| POST | `/api/scans/{id}/resume/` | admin/operator | resume `PAUSED` batches; optional `window_seconds` |
| GET | `/api/scans/{id}/observations/` | all | observations with overrides; filters `?lifecycle=`, `?entity_type=`; up to 2000 items |
| GET | `/api/scans/{id}/diff/` | all | compare with the previous completed run with the same modules and group or target list; `?against=<id>` picks another run |
| GET | `/api/scans/{id}/export/?format=csv\|json` | admin/operator/analyst | export a finished run |
| POST | `/api/scans/{id}/export/defectdojo/` | admin/operator/analyst | manual DefectDojo export |
| POST | `/api/observations/import/` | admin/operator/analyst | import JSON results (`surfacex.export.v1`) |

A scan deadline is always enforced. Without `window_seconds` the API applies 3600 s. Roles other than `admin` may request at most 3600 s; `admin` at most 86,400 s.

## Allowlist, overrides, audit

| Method | Path | Roles | Description |
|---|---|---|---|
| GET/POST | `/api/allowlist/` | read: all; write: admin/operator | list / add an entry |
| PATCH/DELETE | `/api/allowlist/{id}/` | admin/operator | edit (including `enabled`) / delete |
| POST | `/api/overrides/` | admin/operator/analyst | upsert a manual override |
| DELETE | `/api/overrides/{id}/` | admin/operator/analyst | delete an override |
| GET | `/api/audit/` | admin | last 200 audit entries |

## Internal (worker)

Requires `X-Worker-Token`; no user session. The gateway returns `404` for `/api/internal/`, so these are reachable only from the `backend` network.

| Method | Path | Description |
|---|---|---|
| POST | `/api/internal/batches/reconcile/` | republish stale batches, pause after deadline |
| POST | `/api/internal/schedules/dispatch/` | start due schedules |
| POST | `/api/internal/batches/{id}/claim/` | claim a batch |
| POST | `/api/internal/batches/{id}/progress/` | progress; may return `cancel_requested` after the deadline |
| GET | `/api/internal/batches/{id}/cancel-check/` | poll for cancel and window pause |
| POST | `/api/internal/batches/{id}/complete/` | submit result; **409** if the batch is already `PAUSED` |
| POST | `/api/internal/batches/{id}/fail/` | report failure or cancel; `PAUSED` stays `PAUSED` |

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health/` | API liveness and database state (no login) |
| GET | `/api/system/` | component versions and DefectDojo status (logged in) |

File formats: [import-export.md](import-export.md). Role matrix: [security.md](security.md#roles).
