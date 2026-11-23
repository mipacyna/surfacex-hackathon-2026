# SurfaceX demo labs

Three local environments for testing and demos. All services are mock targets (static pages and banners, no logins or real data) in isolated Docker networks.

| Lab | Start | Purpose |
|---|---|---|
| `lab-target` | starts with the stack | first scan right after install |
| `demo/lab` | `./demo/lab/lab.sh up` | full demo: two scans, changes, roles |
| `deploy/demo-lab` | `docker compose -f deploy/demo-lab/compose.yml up -d` | ports that change over time (`FLAKY`, `GONE`) |

## 1. `lab-target`: built-in target

Part of `compose.yml` (`scanner` network, address `172.30.0.10`): HTTP `80` and `8080`, TLS `443`, `/admin` and `/login` pages. On API start (`SEED_LAB_TARGET=1`) it creates the targets `lab-target.surfacex.local` and `172.30.0.10`, allowlist entries and the **`lab-local`** group. Host preview: `http://127.0.0.1:18088`.

Select modules on the Dashboard and run a scan of `lab-local` from **Groups**.

## 2. `demo/lab`: seven-host network

```bash
./demo/lab/lab.sh up       # start the lab and attach the SurfaceX worker to the asi-lab network
./demo/lab/lab.sh mutate   # changes between scan 1 and scan 2
./demo/lab/lab.sh down     # remove the lab
```

Network `asi-lab`, `10.77.0.0/24`. Needs a running SurfaceX stack and `openssl` (the test certificate goes to `demo/lab/certs/`, untracked).

| Address | Service | Notes |
|---|---|---|
| `10.77.0.10` | faculty website (CMS) | WordPress, PHP 7.4.33, `PHPSESSID` cookie |
| `10.77.0.11` | admin panel | redirect to `/admin/` |
| `10.77.0.12` | staging environment | version 1, then version 2 and port `8443` after `mutate` |
| `10.77.0.13` | HTTPS intranet | TLS certificate, HSTS |
| `10.77.0.14` | IP camera | "NetCam-2000" |
| `10.77.0.15` | measurement server | switched off by `mutate` |
| `10.77.0.16` | new application | started by `mutate` |

Before scanning, add `10.77.0.0/24` to the allowlist and import the targets from [`lab/targets.csv`](lab/targets.csv) (or [`lab/targets.json`](lab/targets.json)); they go to the "Lab demo" group.

## 3. `deploy/demo-lab`: target with changing ports

One container that moves to the next phase every 90 s, opening and closing ports and changing banners, versions, headers and cookies. Phases and controls: [`deploy/demo-lab/README.md`](../deploy/demo-lab/README.md).
