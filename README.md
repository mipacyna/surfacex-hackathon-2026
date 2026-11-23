# SurfaceX

Open-source attack surface discovery for large networks. SurfaceX scans targets on a schedule, finds live hosts and services, fingerprints web technologies, collects headers, cookies and TLS certificates, and shows what changed between scans.

The project started at HackNation 2026 and is being developed further as an open-source tool.

## Features

- **Targets:** IPs, CIDR ranges and domains, added by hand or imported from TXT/CSV/JSON (up to 10,000 targets), organized in groups.
- **Discovery:** `nmap` (hosts, ports, services, versions) and ProjectDiscovery `httpx` (title, status, headers, cookies, TLS certificate, technologies), run in parallel by Celery workers.
- **Fingerprinting:** CMS, framework and server detection, custom declarative YAML signatures, hints for admin panels and staging environments, IoT/OT ports.
- **Change tracking:** each observation is marked `NEW`, `CHANGED`, `UNCHANGED`, `MISSING`, `FLAKY` or `GONE` against the previous scan. A flapping host is not reported as gone after a single missed scan.
- **Safe scanning:** allowlist, hard rate ceilings, a mandatory time window with pause and resume. No login attempts, brute force or exploitation.
- **Team use:** four roles (`admin`, `operator`, `analyst`, `viewer`), persistent manual overrides (tags, notes), audit log, optional TOTP MFA.
- **Integrations:** JSON/CSV export, result import, automatic push to DefectDojo, group schedules, passive sources (crt.sh, RDAP).
- **Data protection:** AES-256-GCM encryption of evidence and notes, Argon2id password hashes, encrypted database backups.

## Quick start

Requirements: Git and Docker with Compose (Linux, macOS, or Windows with WSL2), about 8 GB RAM, free ports `8080`, `8081` and `18088`.

```bash
git clone https://github.com/mipacyna/surfacex.git
cd surfacex
cp .env.example .env
./scripts/preflight.sh        # environment check
./scripts/init-secrets.sh     # generate secrets in secrets/ (not tracked by Git)
docker compose up --build -d
./scripts/smoke-test.sh       # expected: smoke PASSED
```

The first build takes a few minutes. After startup:

| Service | URL | Local account |
|---|---|---|
| SurfaceX | http://localhost:8080 | `admin` / `changeme` |
| DefectDojo (optional) | http://localhost:8081 | `admin` / `changeme` |
| Demo target | http://localhost:18088 | none |

The `admin` / `changeme` account is for local use only. Set `BOOTSTRAP_ADMIN_PASSWORD` in `.env` before exposing an instance.

Common variations:

- port `8080` is taken: set `GATEWAY_HTTP_PORT=18080` in `.env`;
- run without DefectDojo (less RAM): remove `COMPOSE_PROFILES=defectdojo` from `.env`;
- DefectDojo does not start: run `./scripts/doctor-defectdojo.sh`, then `./scripts/start-defectdojo.sh`;
- stop and keep data: `docker compose down`.

## First scan

The stack ships with a built-in `lab-target` and a ready-made `lab-local` group.

1. Log in at http://localhost:8080 as `admin`.
2. On the **Dashboard**, select the `full-pipeline` module. Group scans use the modules selected there.
3. Open **Groups** and click **Scan now** on `lab-local`.
4. Watch progress in **Scans**. When it finishes, open **Findings**, add a note (**Add override**) and download **Export JSON** or **Export CSV**.
5. Run a second scan to see lifecycle changes in **Changes over time**.

For a larger lab with seven hosts and a mutation step, see [demo/README.md](demo/README.md).

## Architecture

```text
Browser → gateway (nginx :8080) → web (React)
                                → api (Django REST) → PostgreSQL
                                                    → Redis → worker (Celery: nmap, httpx, signatures)
                                                                │ results via /api/internal/ (token)
                                  api ◀─────────────────────────┘
                                  api ⇢ DefectDojo (optional profile)
```

| Service | Role |
|---|---|
| `gateway` | the only SurfaceX port exposed on the host |
| `web` | React/TypeScript UI |
| `api` | REST API, RBAC, normalization, diffing, export |
| `scheduler` | Celery Beat: schedules and queue recovery |
| `worker` | runs scans; the only service with traffic to scanned networks and no database access |
| `postgres`, `redis` | persistent data; queue and cache |
| `backup` | periodic encrypted database dump |
| `lab-target` | built-in demo target |
| `defectdojo*` | optional DefectDojo |

## Documentation

| Topic | Document |
|---|---|
| Components, networks, scan flow | [docs/architecture.md](docs/architecture.md) |
| REST API | [docs/api.md](docs/api.md) |
| Data model and observation lifecycle | [docs/data-model.md](docs/data-model.md) |
| Scanning policy, limits, groups, schedules, passive discovery | [docs/scanning-policy.md](docs/scanning-policy.md) |
| Custom signatures | [docs/signatures.md](docs/signatures.md) |
| Import, export, DefectDojo | [docs/import-export.md](docs/import-export.md) |
| Roles, authentication, encryption, threat model | [docs/security.md](docs/security.md) |
| Operations, backup, supported platforms | [docs/operations.md](docs/operations.md) |

## Tests

```bash
docker compose exec -T api python manage.py test apps --settings=config.settings_test
./scripts/smoke-test.sh                          # instance smoke test
./scripts/backup.sh && ./scripts/restore-test.sh # backup and restore check
```

## Repository layout

| Directory | Contents |
|---|---|
| `backend/` | Django API, scan logic, Celery tasks, tests |
| `web/` | React/TypeScript frontend (the bundle is built inside the image) |
| `signatures/` | YAML detection signatures |
| `schemas/` | JSON schema of the export format |
| `deploy/` | Dockerfiles, nginx config, demo targets, DefectDojo settings |
| `scripts/` | preflight, secrets, smoke test, backup, DefectDojo diagnostics |
| `demo/` | demo lab environments |
| `docs/` | documentation |

Secrets, `.env`, `node_modules/`, `dist/` and local backups are never committed. `.gitignore` and `.dockerignore` enforce this.

## Scope and limitations

SurfaceX only performs reconnaissance. It does not log in to services, guess passwords, exploit vulnerabilities or follow redirects. Scan only networks you are authorized to test. The allowlist enforces the scope.

It runs as a local Docker Compose stack, with no high availability and no Kubernetes support. The default configuration is meant for local and lab use. See [docs/security.md](docs/security.md) for known limitations.
