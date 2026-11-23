# Scanning policy

## Principles

SurfaceX does discovery only. Allowed:

- live host detection (ICMP echo, TCP SYN ping);
- TCP port scanning;
- service identification with nmap `-sV`;
- single HTTP/HTTPS `GET` requests to discovered endpoints, favicon fetch;
- reading TLS certificates;
- matching declarative signatures against collected responses;
- passive lookups (crt.sh / RDAP) as the `passive-discovery` module, without expanding the target list automatically.

It does not log in, submit forms, brute force or fuzz, exploit vulnerabilities, use `nmap -A` or NSE scripts, and **does not follow redirects**.

## Host discovery

| Mode | Command | When |
|---|---|---|
| Host discovery only | `nmap -sn -PE -PS80,443 --host-timeout <N>s` | only the `host-discovery` module is selected; method `icmp`, `tcp` or `icmp-tcp` |
| Port scan | `nmap -Pn -sS\|-sT -p <ports> …` | `port-scan`, `service-detect`, `full-pipeline` |

The port scan uses `-Pn` so hosts that block ICMP are not skipped. No response in a full run leads to `MISSING`, then `FLAKY` and `GONE` ([data-model.md](data-model.md#lifecycle)).

## Port profiles

- **`discovery-fast`** (default): `21,22,23,25,53,80,110,111,135,139,143,443,445,465,587,993,995,1433,1521,2049,3306,3389,5432,5900,6379,8000,8080,8443,8888,9200,27017`
- **`discovery-web`**: `80,443,3000,5000,7001,8000,8080,8443,8888,9000,9443`
- **`discovery-full`**: nmap top 1000 (`--top-ports 1000`), in the `port-scan` module; recommended for single hosts and small ranges.
- **`custom`**: up to 1000 unique ports supplied by the user.
- **IoT/OT ports** (`includeIoT` option of `port-scan`), added to the chosen profile: `23,80,102,443,502,554,1883,2222,8000,8554,8883,9100,20000,37777,44818,47808,49152`

## nmap command

```bash
nmap -Pn -sS -p <ports> -T3 --max-rate 200 -sV --version-intensity 5 --max-retries 1 -oX - <target>
```

`-sV` is added only for `service-detect` or `full-pipeline`; `-6` for IPv6. The XML output is parsed in the worker and only `open` ports are kept.

| Environment | Mode |
|---|---|
| Linux with working `NET_RAW` | SYN (`-sS`), preferred |
| Docker Desktop (macOS/Windows) or no raw sockets | TCP connect (`-sT`), automatic fallback |

The worker checks raw socket availability before each batch. The mode is stored in `ScanBatch.result.metadata.scan_mode`.

## httpx

Pinned in the worker image (`HTTPX_VERSION`, currently `v1.6.9`), built from source. httpx receives only endpoints built from open ports found by nmap (web ports or services identified as HTTP/HTTPS). When nmap is not run (HTTP/TLS/signature modules only), the ports from the module filters are probed; CIDR ranges produce no endpoints in that case.

```bash
httpx -silent -json -status-code -title -server \
  -timeout 5 -retries 1 -rate-limit 50 -threads 50 \
  -include-response-header -favicon -include-response \
  -tech-detect -tls-grab
```

- `-tech-detect` follows the `techDetect` filter (on by default in `full-pipeline`); `-tls-grab` follows the `tls-cert` module or `includeTls`.
- `-follow-redirects` is **not** used. The `3xx` status and `Location` header are stored, but the redirect target could be outside the allowlist. The `followRedirects` and `maxRedirects` filters are ignored.
- The database gets a trimmed record: no full response, body excerpt up to 4000 characters. Signatures analyze up to 64 KiB of body.

## Limits

Ceilings are hard and apply regardless of UI or API input (`runner.py`).

| Parameter | Default | UI range | Ceiling |
|---|---|---|---|
| nmap `--max-rate` (packets/s) | 200 | 10–5000 | `SCAN_MAX_RATE_CEILING` = 1000 |
| nmap timing template | `T3` | `T2`–`T4` | `T4` is lowered to `T3` unless `SCAN_ALLOW_AGGRESSIVE_TIMING=1` |
| nmap `--version-intensity` | 5 | 0–9 | `SCAN_VERSION_INTENSITY_CEILING` = 7 |
| nmap `--max-retries` | 1 | n/a | fixed |
| httpx `-rate-limit` (requests/s) | 50 | 1–500 | `SCAN_HTTPX_RATE_CEILING` = 150 |
| httpx `-threads` | min(50, rate) | n/a | `SCAN_HTTPX_THREADS_CEILING` = 50 |
| httpx `-timeout` | 5 s | 1–30 s | n/a |
| Single nmap or httpx run | 180 s | n/a | fixed |
| Tool output size | 2 MiB | n/a | fixed |
| Batch result size | 1.8 MiB | n/a | fixed |
| Observations / endpoints per batch | 2000 | n/a | fixed |
| CIDR range of one target | n/a | n/a | 4096 addresses |
| Targets per scan, group or import | n/a | n/a | 10,000 |
| Target import file | n/a | n/a | 5 MiB |
| Parallel batches per worker container | 2 (`WORKER_CONCURRENCY`) | n/a | scale with `--scale worker=N` |

Exceeding a time or size limit fails that batch; other batches continue. Because of the 180 s limit, a single port-scan target should not be larger than a `/24`; pass larger ranges as a list of subnets.

## Allowlist and DNS

1. The allowlist is global: IP, CIDR and domain entries (a domain covers its subdomains) apply to every user.
2. A target is checked on save, on import, on scan start and again when a worker claims the batch.
3. An allowlisted domain authorizes that name. `SCAN_ALLOWLIST_ENFORCE_RESOLVED_IP=1` additionally requires the resolved IP to fall inside approved IP/CIDR ranges.
4. A target outside the allowlist is rejected and its batch fails with a message.
5. An empty allowlist (no active entries) does not restrict scope. Add entries before scanning a real network.

## Time windows

Every run has a mandatory `window_seconds` and `deadline_at`. If the request omits it, `SCAN_DEFAULT_WINDOW_SECONDS` applies (default 3600 s).

- Roles other than `admin`: fixed 1 h in the UI, at most 3600 s via the API.
- `admin`: 30 min, 1 h or 2 h in the UI; up to 86,400 s via the API.
- The same limits apply to host scans, group scans and Resume.

After `deadline_at`:

1. Unfinished batches become `paused` (applied by the reconciler every 60 s and by every worker progress or cancel poll).
2. The worker polls the API every 2 s, sends SIGTERM to the nmap/httpx process group, and SIGKILL after 5 s.
3. A late result for a paused batch is rejected (HTTP 409).
4. The run becomes `partial` and can be resumed; **Resume** requeues only paused batches.
5. A partial run never lowers states to `MISSING` or `GONE`.

There is no automatic resume in the next window; recurrence comes from group schedules.

A run is `completed` only if all batches succeeded and the API accepted their results.

## Groups and schedules

A group is a named set of targets, shared by all users; a host can belong to several groups. Admin and operator can create groups, change members, scan, schedule and delete. Everyone can read them.

A group has at most one schedule:

```json
{
  "enabled": true,
  "frequency": "weekly",
  "interval_hours": 24,
  "time_of_day": "02:30",
  "weekday": 0,
  "modules": [{"id": "full-pipeline", "filters": {}}]
}
```

| `frequency` | Meaning |
|---|---|
| `hourly` | every `interval_hours` (1–168) hours, from saving and from each run |
| `daily` | every day at `time_of_day` (UTC) |
| `weekly` | on `weekday` (0 = Monday … 6 = Sunday) at `time_of_day` (UTC) |

Modules are snapshotted when the schedule is saved (the UI uses the modules selected on the dashboard). Each save recomputes `next_run_at`.

Execution:

1. Celery Beat publishes `scans.dispatch_schedules` every 60 s.
2. The worker calls `POST /api/internal/schedules/dispatch/`.
3. The API locks due schedules (`SELECT … FOR UPDATE SKIP LOCKED`, up to 20 per call) and creates a run for all hosts of each group.
4. `client_request_id = schedule:<id>:<due time>` guarantees one run per due time, even if the task is retried.
5. The usual DefectDojo auto-export runs when the scan finishes.

If the previous scheduled run is still going, the slot is skipped (`last_status`) so scans never overlap. An empty group or invalid module snapshot is skipped with a reason. Slots missed during downtime run once, not once per missed slot. Accuracy is about a minute; busy workers can delay a start.

## Passive discovery

The keyless `passive-discovery` module queries Certificate Transparency (crt.sh) and RDAP for saved targets in a run. It does **not** add hosts to the inventory and does **not** bypass the allowlist. Select it on its own or with nmap/httpx modules; it is not part of `full-pipeline`.

For each `domain`/`ip` target the worker queries crt.sh (domains, with `includeCrt`) and RDAP (with `includeRdap`), stores the result in the batch `passive` payload, and normalization creates a `passive:{query}` host observation with `kind=passive` evidence. CIDR targets are skipped with a warning. A provider failure becomes a warning, not a batch failure.

| Source | Applies to | Returns |
|---|---|---|
| crt.sh | domains | up to 100 normalized names within the queried domain (wildcards reduced to apex, deduplicated) |
| rdap.org | domains and IPs | `handle`, `name`, `country`, `network`, `asns`, `nameservers` (domains only) |

Limits: HTTP timeout 8 s, response cap 2 MiB, input must be an IPv4/IPv6 address or FQDN (no URLs, no `localhost`), ad-hoc API results cached for 15 minutes. Public providers may rate-limit; SurfaceX does not work around that and stores no API keys. Passive results stay in SurfaceX and are not sent to DefectDojo; a passive-only scan ends with export status `skipped`.

Out of scope: auto-adding discovered subdomains, paid sources (Shodan, SecurityTrails), bulk multi-domain discovery.
