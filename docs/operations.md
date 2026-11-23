# Operations

## Start and stop

```bash
./scripts/init-secrets.sh
docker compose up --build -d
docker compose ps
docker compose down          # keeps volumes
```

UI: `http://localhost:${GATEWAY_HTTP_PORT:-8080}`. Health: `/api/health/`. DefectDojo (profile): `./scripts/start-defectdojo.sh`, port `${DEFECTDOJO_HTTP_PORT:-8081}`.

## Services

| Service | Role |
|---|---|
| `gateway` | HTTP entry (port `8080`), no TLS termination |
| `web` | React UI |
| `api` | Django/DRF |
| `scheduler` | Celery Beat (reconcile, schedules) |
| `worker` | Celery plus nmap/httpx |
| `postgres` / `redis` | data / broker |
| `backup` | encrypted `pg_dump` loop |
| `lab-target` | demo target (host port `18088`) |

## Health checks and logs

```bash
docker compose ps
docker compose logs -f api worker scheduler
docker compose exec api python manage.py check
./scripts/smoke-test.sh
```

Verification after a rebuild:

```bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
./scripts/smoke-test.sh
docker compose exec -T api python manage.py test apps --settings=config.settings_test
```

The smoke test checks health, the database, login, and the targets, scans and groups lists. Every service with a healthcheck should be `healthy`.

## Scaling workers

```bash
docker compose up -d --scale worker=3
```

Memory and CPU limits are in `compose.yml` and `.env`. Celery prefetch is 1; visibility timeout is about 360 s.

## Reconcile and windows

The scheduler's reconcile task republishes stale `QUEUED`/`RUNNING` batches and applies deadlines (`PAUSED`). Tune with `SCAN_RECONCILE_INTERVAL_SECONDS` and `SCAN_RECONCILE_STALE_SECONDS`. The worker's cancel-check also pauses after the deadline, without waiting for reconcile.

## Backup and restore

The `backup` container periodically runs `pg_dump`, encrypts it with `openssl enc -aes-256-cbc -pbkdf2` using `secrets/backup_key`, and writes `surfacex-YYYYMMDDThhmmssZ.sql.enc` to the `backup_data` volume. The interval is `BACKUP_INTERVAL_SECONDS` (default 86400). The backup key is not the same as the application data key.

```bash
docker compose exec backup ls -la /backups   # list backups
./scripts/backup.sh                          # one-shot backup to backups/
./scripts/restore-test.sh [file.sql.enc]     # decrypt, load into a temp Postgres, run a check query
```

Manual restore:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:secrets/backup_key \
  -in surfacex-<timestamp>.sql.enc -out restore.sql
docker run --rm -d --name sx-restore-pg -e POSTGRES_PASSWORD=restore \
  -e POSTGRES_USER=surfacex -e POSTGRES_DB=surfacex postgres:16
docker exec -i sx-restore-pg psql -U surfacex -d surfacex < restore.sql
docker exec sx-restore-pg psql -U surfacex -d surfacex -c "SELECT count(*) FROM scans_scanrun;"
docker rm -f sx-restore-pg && rm restore.sql
```

Backups do not include DefectDojo volumes (separate database). Losing `backup_key` means dumps cannot be decrypted.

## Troubleshooting

| Symptom | Check |
|---|---|
| 502 / maintenance page | gateway and `api` are healthy |
| Scan not queued / allowlist error | the target must fall inside an active allowlist entry |
| Batch fails with "exceeded the 180-second timeout" | the target is too large for one nmap run: split into `/24` subnets or narrow the port profile |
| Worker does not claim batches | `WORKER_TOKEN`, `scanner` network, worker logs |
| DefectDojo is down | `COMPOSE_PROFILES=defectdojo`, `./scripts/doctor-defectdojo.sh` |
| Session keeps logging out | use the same origin (IP vs hostname); the UI has an `X-Sessionid` fallback |

## Supported platforms

Containers are always Linux images; Windows Containers are not supported.

| Host | Engine | Images | nmap mode |
|---|---|---|---|
| Linux `amd64` | Docker Engine + Compose | `linux/amd64` | SYN if `NET_RAW` works |
| Linux `arm64` | Docker Engine + Compose | `linux/arm64` | SYN if `NET_RAW` works |
| macOS Intel | Docker Desktop | `linux/amd64` | TCP connect |
| macOS Apple Silicon | Docker Desktop | `linux/arm64` | TCP connect |
| Windows 10/11 | Docker Desktop + WSL2 | `linux/amd64` | TCP connect |

On Windows, use Docker Desktop with the WSL2 backend and Linux containers, give it at least 8 GB RAM, and clone and run Compose from inside WSL2 on the Linux filesystem (not under `C:\`) to avoid slow bind mounts. On Docker Desktop (Windows and macOS), networking differs from native Linux, `network_mode: host` is not allowed, and raw sockets are usually unavailable, so the worker falls back to TCP connect scan.
