---
name: docker-compose-expert
description: Designs, reviews, secures, and troubleshoots Docker Compose stacks for this project. Use when creating or changing compose files, Dockerfiles, networks, volumes, healthchecks, secrets, multi-architecture builds, container capabilities, or local deployment workflows.
---

# Docker Compose Expert

## Project defaults

- Docker Compose is the only orchestration layer.
- Do not introduce Terraform, Ansible, Kubernetes, Helm, Swarm, or cloud-only services.
- Support native `linux/amd64` and `linux/arm64`.
- Support Linux Docker Engine; Docker Desktop on Intel/Apple Silicon macOS; Docker Desktop on Windows 10/11 with WSL2 and Linux containers.
- Keep the complete MVP runnable locally without SaaS dependencies.
- Read `docs/architecture.md` before structural changes.

## Service boundaries

Preserve these logical services:

- gateway: the only host-published entry point;
- web: static React frontend;
- api: Django/DRF authentication, RBAC, validation and persistence;
- scheduler: Celery Beat schedules, snapshots, batches, deadlines and ETA;
- redis: sessions, Celery broker and leases;
- postgres: durable source of truth;
- worker: Celery worker for nmap discovery, ProjectDiscovery httpx and custom fingerprint signatures;
- backup: encrypted PostgreSQL backup.

Workers submit results through the internal API. Do not give workers database administrator credentials or Docker socket access.

## Network policy

Use three explicit networks:

- `edge`: gateway and web;
- `backend`: internal API, scheduler, Redis, PostgreSQL and backup traffic;
- `scanner`: worker egress to authorized targets.

Publish only gateway ports. Do not publish PostgreSQL, Redis, API or worker ports on the host.

Avoid `network_mode: host`. It is not portable to Docker Desktop and breaks the project isolation model.

## Security baseline

For every service:

- run as a non-root user when the image supports it;
- set `security_opt: ["no-new-privileges:true"]`;
- use a read-only root filesystem where practical;
- add explicit writable `tmpfs` or volumes only where needed;
- set CPU, memory and PID limits;
- define a healthcheck;
- use a restart policy appropriate for local operation;
- never embed secrets in an image, Compose file or committed `.env`.

Only the worker may receive `NET_RAW`. Add `NET_ADMIN` only after a concrete, documented test proves it is required. Never use `privileged: true`.

Mount secrets from gitignored files with mode `0600`. Keep examples limited to non-secret placeholders.

## Multi-architecture rules

- Do not hardcode `platform: linux/amd64` in `compose.yml`.
- Use multi-stage Dockerfiles with `TARGETOS` and `TARGETARCH`.
- Prefer official Python base images and architecture-compatible wheels; avoid native compile dependencies when possible.
- Install nmap from the target image package repository; never copy a host binary.
- Build a pinned ProjectDiscovery httpx version from source for the target architecture; do not use the unrelated Python package named httpx.
- Ensure every base image publishes both `linux/amd64` and `linux/arm64`.
- Define multi-platform builds in `docker-bake.hcl`.
- Use QEMU for validation only, not as the default local runtime.

The worker must detect raw-socket support:

- use SYN scan on compatible native Linux;
- fall back to TCP connect scan on Docker Desktop or when raw sockets are unavailable;
- record the selected mode in scan metadata.

## Change workflow

1. Inspect the existing Compose files, Dockerfiles and relevant documentation.
2. Identify affected trust boundaries, networks, volumes and architecture support.
3. Make the smallest coherent change.
4. Validate interpolation and merged configuration:

   ```bash
   docker compose config --quiet
   ```

5. Build affected services for the native architecture.
6. For image changes, validate both architectures with Buildx Bake.
7. Start only the affected services when possible.
8. Wait for healthchecks and run the smoke test.
9. Check logs for secret leakage, restart loops and permission errors.
10. Update `docs/architecture.md` or `docs/operations.md` when behavior changes.

## Safety rules

- Never run `docker compose down -v`, remove named volumes, or prune images/volumes without explicit user approval.
- Do not replace persistent volumes during routine configuration changes.
- Do not mark a service healthy with a process-only check when a protocol-level check is available.
- Do not use `depends_on` as a substitute for healthchecks and application retry logic.
- Do not claim cross-architecture support unless both images build and the documented smoke matrix passes.

## Expected output

When reporting a Compose change, state:

- changed services;
- exposed ports and network changes;
- volume or migration impact;
- added capabilities;
- validations executed;
- untested architectures or platform limitations.
