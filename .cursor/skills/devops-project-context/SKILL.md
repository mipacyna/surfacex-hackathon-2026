---
name: devops-project-context
description: Applies the SurfaceX Attack Surface Intelligence DevOps constraints and architecture to implementation decisions. Use for deployment, CI, containers, networking, secrets, observability, release, platform compatibility, or any change that affects how the project is built or operated.
---

# DevOps Project Context

## Product goal

SurfaceX is a local-first Attack Surface Intelligence prototype for safe, recurring discovery of more than 10,000 authorized targets. It detects hosts, services, HTTP/TLS technologies and changes over time. It does not perform exploitation, authentication attempts or brute force.

Read `docs/architecture.md` for component boundaries.

## Fixed project decisions

- Runtime orchestration: Docker Compose.
- Do not add Terraform, Ansible, Kubernetes, Helm or Swarm.
- Application stack: Python/Django/DRF, Celery, React/TypeScript, PostgreSQL and Redis.
- Scanning stack: nmap discovery, ProjectDiscovery httpx and custom declarative signatures.
- Supported image architectures: `linux/amd64` and `linux/arm64`.
- Supported local environments: Linux Docker Engine; Docker Desktop on Intel/Apple Silicon macOS; Docker Desktop on Windows 10/11 with WSL2 and Linux containers.
- No mandatory SaaS or cloud dependency.
- DefectDojo is optional and must not block local startup.

Treat a proposal that violates these decisions as an architecture change. Explain the conflict before implementing it.

## Logical services

- gateway: only host-published entry point and TLS termination;
- web: React frontend;
- api: Django/DRF for RBAC, validation, persistence, diff and exports;
- scheduler: Celery Beat for scan windows, snapshots, batches, checkpoints and ETA;
- redis: sessions, Celery broker and leases;
- postgres: durable source of truth;
- worker: Celery worker for nmap discovery, ProjectDiscovery httpx, evidence normalization and signatures;
- backup: encrypted PostgreSQL backup and restore verification.

Workers send results through the internal API. They do not receive administrative database credentials.

## Network and privilege model

- `edge`: gateway and web;
- `backend`: internal API, scheduler, Redis, PostgreSQL and backup traffic;
- `scanner`: worker egress to authorized targets.

Only gateway ports are published. PostgreSQL and Redis stay internal.

Only workers may receive `NET_RAW`. Use `NET_ADMIN` only with documented evidence. Never use privileged containers or mount the Docker socket.

On native Linux, prefer nmap SYN scan when raw sockets work. On Docker Desktop or without the capability, use TCP connect scan and record that mode.

## Data and security invariants

- Scanner observations are immutable.
- User edits are persistent manual overrides.
- Active scans use configuration snapshots.
- Failed, partial or cancelled measurements do not cause `MISSING` or `GONE`.
- Lifecycle is tracked separately for hosts, services, HTTP endpoints, technologies and certificates.
- Sensitive headers, cookie values, banners, evidence, notes and integration credentials are encrypted with AES-256-GCM before database storage.
- Passwords use Argon2id.
- Sessions are stored in Redis and delivered through secure cookies.
- Every authorization-relevant change is audited.
- Backups are encrypted with a separate key and must pass restore tests.

## Safe-scanning invariants

- Require explicit target allowlists.
- Revalidate resolved addresses immediately before connecting.
- Limit target count, ports, concurrency, redirects, response size and timeouts.
- HTTP signatures use only `HEAD` and `GET`.
- Signature paths are relative and cannot change the destination host.
- Do not add login attempts, credential checks, brute force, exploitation or unrestricted crawling.
- Do not scan public or user-provided targets during automated tests; use mocks and the controlled lab.

## Delivery invariants

A fresh local install requires only Git and Docker with Compose. It must not require host-installed Python, Node.js, PostgreSQL, Redis or nmap.

Every release candidate must:

- build native images for amd64 and arm64;
- validate `docker compose config`;
- run migrations and healthchecks;
- pass login, import, test-scan and export smoke tests;
- pass a native smoke test on at least Linux amd64 and Apple Silicon arm64;
- document untested platform combinations.

## Change checklist

For DevOps changes:

1. identify affected architecture decisions and trust boundaries;
2. inspect current Compose, Dockerfiles, scripts and documentation;
3. preserve local-only startup and multi-architecture support;
4. avoid new external dependencies unless optional;
5. validate the smallest affected scope;
6. run security and secret checks;
7. update durable documentation;
8. report platform coverage and limitations.

Never remove volumes, rotate keys, change exposed ports or weaken scanning restrictions without explicit user approval.
