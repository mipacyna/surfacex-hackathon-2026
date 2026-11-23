# Import and export

## Target import

```http
POST /api/targets/import/
Content-Type: multipart/form-data
```

Roles: `admin`, `operator`. UI: **Targets** → **Import hosts**.

| Field | Description |
|---|---|
| `file` | TXT, CSV or JSON file (detected by extension or content) |
| `start_scan` | default `true`: queue a scan of the imported targets |
| `modules` | optional JSON with scan modules; default `full-pipeline` |
| `group_id` | ID of an existing group that receives all targets in the file |
| `group_name` | alternatively, a group name; created if missing (case-insensitive) |

Limits: **10,000 targets** and **5 MiB** per file; CIDR ranges up to 4096 addresses.

**TXT:** one address per line (IP, CIDR or domain). The type is detected automatically.

**CSV:** an address column is required: `value` (or `address`, `host`, `target`, `ip`). Optional: `type` (`ip` / `cidr` / `domain`), `comment` (or `notes`), `group` (or `groups`, `group_name`). Other columns are ignored.

```csv
value,type,comment,group
10.77.0.10,ip,Faculty website (CMS),Lab demo
10.77.0.0/24,cidr,Lab subnet,Lab demo;DMZ
app.example.lab,domain,Portal,Web
```

**JSON:**

```json
{
  "schema_version": 1,
  "targets": [
    { "value": "10.0.0.0/24", "type": "cidr", "comment": "test network", "groups": ["lab", "dmz"] },
    { "value": "app.example.lab", "type": "domain", "comment": "portal" },
    { "value": "10.0.0.15" }
  ]
}
```

A list item can also be a plain address string. A `schema_version` other than `1` rejects the file.

**Groups** can be set per row (`group` column in CSV, `group` / `groups` in JSON). Separate several with `;` or `|` (a list in JSON). Missing groups are created. The group from the form and the groups from rows are combined.

**Validation:**

- every address goes through the same normalization as a manually added target (IPv4/IPv6, canonical CIDR, IDN domains);
- invalid rows are skipped and returned in `parse_errors` (up to 50 messages);
- duplicates in the file count in `skipped_duplicates_in_file`, targets that already exist in `existing_count`;
- targets outside the allowlist are rejected.

The response contains `created_count`, `existing_count`, `total_count`, `target_ids`, `groups[]` (`{id, name, created, added_count}`) and `scan` with the created run, if a scan was started.

## Result export

```http
GET /api/scans/<id>/export/?format=json
GET /api/scans/<id>/export/?format=csv
```

Roles: `admin`, `operator`, `analyst`. Only finished runs can be exported (otherwise HTTP 409). Every export is recorded in the audit log (`scan.export`).

### JSON: `surfacex.export.v1`

Schema: [`schemas/surfacex.export.v1.json`](../schemas/surfacex.export.v1.json).

```json
{
  "schema": "surfacex.export.v1",
  "exported_at": "2026-11-22T08:15:00+00:00",
  "run": {
    "id": 12,
    "status": "completed",
    "group_id": 3,
    "finished_at": "2026-11-22T08:14:31+00:00",
    "modules": [{ "id": "full-pipeline", "filters": {} }],
    "result_summary": { "lifecycle": { "NEW": 4, "CHANGED": 1, "MISSING": 1 } }
  },
  "observations": [
    {
      "id": 481,
      "entity_type": "port",
      "entity_key": "port:10.77.0.11:tcp/80",
      "lifecycle": "CHANGED",
      "target_address": "10.77.0.11",
      "attrs": { "address": "10.77.0.11", "port": 80, "protocol": "tcp", "service": "http", "product": "nginx", "version": "1.27.0" },
      "miss_streak": 0,
      "source": "scanner"
    }
  ]
}
```

### CSV

One row per observation; `attrs_json` holds the attributes as JSON.

```csv
entity_type,entity_key,lifecycle,target_address,source,miss_streak,attrs_json
port,port:10.77.0.11:tcp/80,CHANGED,10.77.0.11,scanner,0,"{""address"":""10.77.0.11"",""port"":80,""service"":""http""}"
```

## Result import

```http
POST /api/observations/import/
Content-Type: application/json
```

Roles: `admin`, `operator`, `analyst`. Accepts JSON in the `surfacex.export.v1` format; any other `schema` value is rejected. Only JSON can be imported; CSV is export-only.

- Without `run.id`, a new completed run marked as imported is created.
- With `run.id`, observations are added to that run (updated by `entity_key`).
- Observations go to the same tables as scanner results with `source = import`, and appear in Findings, export and diffs.
- Import never changes manual overrides.
- The operation is audited as `observations.import`.

Response: `{ "run_id": 13, "created": 42, "total": 42 }`.

## DefectDojo

When a scan with at least one completed batch finishes, SurfaceX sends a report automatically. Manual fallback:

```http
POST /api/scans/<id>/export/defectdojo/
```

The exporter builds a `Generic Findings Import` report and uploads it through `POST /api/v2/reimport-scan/`. Findings include:

- live hosts (severity `Info`);
- open ports and services with product and version (severity from the port's curiosity rating: `High`, `Medium`, `Low` or `Info`);
- technologies found by httpx and SurfaceX signatures.

`unique_id_from_tool` is a stable hash of observation type, host, port, protocol, endpoint and technology. It does not include the run ID, so re-exporting updates existing findings. The export sets `close_old_findings=false` because one run may cover only part of the saved targets.

The export status (`pending`, `sending`, `sent`, `failed`, `skipped`) is stored on the run and shown in the scan list. Passive results are not sent.

The local stack starts with the `defectdojo` profile. For an external instance set `DEFECTDOJO_URL` and `DEFECTDOJO_API_TOKEN`. Product Type, Product, Engagement and Test names are set with the `DEFECTDOJO_*` variables in `.env.example`.
