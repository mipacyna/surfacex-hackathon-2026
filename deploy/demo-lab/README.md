# Demo lab: target with changing ports

A lightweight container (plain Python, no dependencies) that moves to the next phase every `PHASE_SECONDS` (default 90 s), opening and closing ports and changing banners, versions, headers and cookies. Consecutive scans then show NEW / CHANGED / MISSING / GONE / FLAKY states, interesting headers and signatures. For testing and demos.

## Run

```bash
docker compose -f deploy/demo-lab/compose.yml up -d
```

- **Scan target:** `172.30.0.20` (network `surfacex-demo-lab`). To let the SurfaceX worker reach it, attach the worker to that network and add `172.30.0.0/24` to the allowlist:
  ```bash
  docker network connect surfacex-demo-lab <worker-container>
  ```
- **Control panel (local only):** `http://127.0.0.1:18765/state` (what is open) and `http://127.0.0.1:18765/next` (skip to the next phase).
- **Manual mode:** `PHASE_SECONDS=0 docker compose -f deploy/demo-lab/compose.yml up -d` changes phases only through `/next`.

## Phases

| Phase | Open ports | What it shows |
|---|---|---|
| A baseline | 2222, 8080, 8787, 9000 | everything NEW; interesting headers (X-Powered-By, X-Debug-Token, X-Backend-Server) |
| B changes | 2222, 5000, 8080 | 8787/9000 MISSING, 8080 CHANGED, 5000 NEW (admin panel) |
| C returns | 2222, 5000, 8080, 8787, 9000 | 8787/9000 return as FLAKY, SSH changes version |
| D exposure | 21, 2222, 8080, 8787 | 21 NEW (old FTP), admin panel MISSING |

Scan profile: custom port-scan `21,2222,5000,8080,8787,9000` + service-detect + http-fingerprint.

The services are mocks (banners and static pages only, no logins or data). The container runs in an isolated network, read-only, with a 48 MB limit; only the control panel is exposed, on `127.0.0.1`.
