# Security

## Threat model

SurfaceX runs as a local Compose stack. It assumes a trusted host operator and a lab network. It is not a highly available or multi-tenant service.

Trust boundaries:

- The gateway is the only entry point to the UI and API.
- PostgreSQL and Redis are on the internal `backend` network.
- The worker is on the `scanner` network with egress to targets. It gets no PostgreSQL password and no Docker socket.
- Secrets are mounted as `0600` files (`scripts/init-secrets.sh`) and kept out of Git.

| Risk | Control |
|---|---|
| Scanning outside the approved scope | IP/CIDR/domain allowlist; DNS-to-IP re-check on claim |
| Excess traffic or DoS of a target | Hard nmap and httpx rate ceilings, port limits, timeouts, one retry, mandatory scan window |
| Scanner processes escaping control | Process group plus SIGTERM/SIGKILL; cancel and deadline set `cancel_requested` |
| Privilege escalation | API-level RBAC (`IsAdmin`, `IsAdminOrOperator`, `CanExportFindings`) |
| Evidence leak | AES-256-GCM on sensitive fields |
| Session sniffing | `HttpOnly` cookies; `Secure` over HTTPS |
| ReDoS / SSRF in signatures | Relative paths only, regex and body limits |
| Uncontrolled passive lookups | Fixed hosts (crt.sh, rdap.org), 8 s timeout, 2 MiB cap, 15 min cache, admin/operator only |

Scanner boundaries: discovery only, with no login, brute force or exploitation; single `GET` requests; redirects are not followed; signatures are declarative and make no extra requests.

## Roles

| Role | Scope |
|---|---|
| `admin` | users and roles, audit log, longer scan windows, everything lower roles can do |
| `operator` | targets, groups, schedules, allowlist, starting and stopping scans |
| `analyst` | read, edit results (tags, notes, overrides), import results, export |
| `viewer` | read only |

Permissions are enforced in the API (`backend/apps/scans/permissions.py`); the UI only hides forbidden actions. Roles are fixed; an admin creates accounts and assigns one of the four roles in **Users** (`/api/auth/users/`). An account without a role profile is treated as `viewer`.

Targets, groups, scans, results, overrides and the allowlist are shared by all users; a role only decides what may be changed. The allowlist and limits are system-wide policy. Target addresses and group names are unique across the system.

| Action | admin | operator | analyst | viewer |
|---|---|---|---|---|
| Log in, own session | yes | yes | yes | yes |
| Manage users and roles | yes | no | no | no |
| Manage allowlist (global) | yes | yes (API) | no | no |
| View allowlist | yes | yes | yes | yes |
| Add and delete targets | yes | yes | no | no |
| Groups and schedules | yes | yes | no | no |
| Passive discovery module | yes | yes | no | no |
| Start / stop / resume scans | yes | yes | no | no |
| Configure scan window | yes | no (fixed 1 h) | no | no |
| View dashboard and history | yes | yes | yes | yes |
| Export CSV/JSON | yes | yes | yes | no |
| Import targets | yes | yes | no | no |
| Import results | yes | yes | yes | no |
| Overrides, tags, notes | yes | yes | yes | no |
| Export to DefectDojo | yes | yes | yes | no |
| View audit log | yes | no | no | no |

Enforcement: missing permission is `403`, missing session is `401`. Changes to targets, groups, schedules, allowlist, overrides and accounts, plus scan starts, exports and imports, go to the audit log (admin only). An admin cannot remove their own `admin` role or lock their own account. The worker uses a separate service token that only reaches `/api/internal/`.

## Authentication

- Passwords: Argon2id.
- Sessions: Django cookie (`HttpOnly`, `SameSite=Lax`), stored in the database and refreshed on each request.
- Optional MFA: TOTP (RFC 6238), works offline with Google Authenticator, 1Password, Authy and similar. WebAuthn and recovery codes are not implemented.
- `SECURE_COOKIES=1` sets the `Secure` flag (required over HTTPS).
- Failed logins are audited (`auth.login_failure`); there is no rate limit on attempts.
- A deactivated account (`is_active = false`) cannot log in.

Login flow: `GET /api/auth/csrf/`, then `POST /api/auth/login/`. If the user has MFA, the response is `{ mfa_required: true, mfa_token }` and the UI asks for the 6-digit code, sent to `POST /api/auth/mfa/verify/`. The pending token lives 5 minutes in Redis.

Enable MFA for the admin:

```bash
docker compose exec api python manage.py bootstrap_admin --username admin --enable-mfa
```

The command prints `secret=` and `otpauth=` once; add them to your authenticator app.

## Encryption

Sensitive fields are encrypted in the application with **AES-256-GCM** before they reach PostgreSQL (`backend/apps/scans/crypto.py`):

```text
sx1:<base64url( nonce[12 B] ‖ ciphertext ‖ GCM tag )>
```

- The key comes from `secrets/app_data_key`: if the content base64-decodes to at least 32 bytes, the first 32 bytes are the key; otherwise the key is the SHA-256 of the content.
- Every write uses a random 96-bit nonce.
- Only `api` and `scheduler` get the secret. The worker has no key; it sends results to the API, which encrypts them.

| Model | Field | Content |
|---|---|---|
| `FingerprintEvidence` | `ciphertext` | observation evidence: host, port (banner, product, version), HTTP response, technology, certificate, RDAP/CT result |
| `ManualOverride` | `notes_ciphertext` | analyst note |

These stay in plain text because they are used for search, filtering and diffing: address, port, protocol, service, product and version; HTTP status, title, `Server` header and custom header values (up to 200 characters); cookie names and flags (values are never stored); technology name and confidence; lifecycle states and tags.

| Area | Mechanism |
|---|---|
| User passwords | Argon2id (PBKDF2 fallback) |
| Database backup | `pg_dump` encrypted with `openssl enc -aes-256-cbc -pbkdf2`, using a separate `backup_key` |
| DefectDojo secrets | separate `defectdojo_*` files, including its AES-256 credential key |

Secret files, created by `./scripts/init-secrets.sh` with mode `0600`:

| File | Used by |
|---|---|
| `postgres_password` | postgres, api, scheduler, backup |
| `django_secret_key` | api, scheduler |
| `app_data_key` | api, scheduler |
| `backup_key` | backup |
| `session_hmac` | api |
| `worker_token` | api, worker |
| `defectdojo_*` | DefectDojo services (admin password defaults to `changeme`) |
| `mfa_admin_secret` | optional local copy of the admin TOTP secret |

On Windows with Git Bash, run `init-secrets.sh` before the first `docker compose up`. If Compose starts without the files, Docker may create empty directories named after the secrets; the script removes empty stubs, and a non-empty directory must be moved aside first.

Failure behavior: without `app_data_key`, `seal()` returns an empty string and evidence is stored unencrypted (`meta.encrypted = false`); `init-secrets.sh` always creates the key, so a correct setup does not hit this. If the key is lost or changed, old ciphertext cannot be read, so back it up separately from database backups.

## Audit

Changes to targets, scans, allowlist, users and overrides are written to `audit_log` (visible to admin). Passive lookups log `passive.discover`. Passive discovery reads public sources and does not bypass the allowlist.

## Known limitations

- The default configuration is for local and lab use: HTTP without TLS, `CSRF_PROTECT` and `SECURE_COOKIES` off. A shared deployment needs TLS on a reverse proxy and both variables set to `1`.
- The default `admin` / `changeme` account (SurfaceX and local DefectDojo) must be changed before exposing an instance.
- No login attempt rate limit.
- The TOTP secret (`UserProfile.mfa_secret`) is stored unencrypted; there are no recovery codes.
- The raw batch result (`ScanBatch.result`), with response headers and a body excerpt, is stored as plain JSON. Only evidence records and notes are encrypted. Use host volume encryption (LUKS, FileVault) for full at-rest confidentiality. PostgreSQL has no engine-level encryption (TDE).
- AES key rotation is manual: the ciphertext carries no key version and there is no re-encryption task.
- Sessions are in the Django database, not Redis.
- An empty allowlist enforces nothing, and the resolved-IP check is opt-in (`SCAN_ALLOWLIST_ENFORCE_RESOLVED_IP=1`).
