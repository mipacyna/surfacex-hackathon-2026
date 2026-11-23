# Secrets

Files in this directory are gitignored except this README and `.gitkeep`.

Generate them with:

```bash
./scripts/init-secrets.sh
```

**Windows / Git Bash:** run `init-secrets.sh` **before** the first Compose start.
If Compose starts without files in `secrets/`, Docker often creates **empty directories** named after the secrets (`defectdojo_admin_password`, etc.). The script removes such empty stubs and writes regular files. If a directory is not empty:

```bash
mv secrets/defectdojo_admin_password "secrets/defectdojo_admin_password.bak.$(date +%s)"
./scripts/init-secrets.sh
```

DefectDojo needs its own Compose profile and the full set of `defectdojo_*` secrets.
Simplest start:

```bash
./scripts/start-defectdojo.sh
```

Expected files (mode `0600`):

| File | Used by |
|---|---|
| `postgres_password` | postgres, api, scheduler, backup |
| `django_secret_key` | api, scheduler |
| `app_data_key` | api |
| `backup_key` | backup |
| `session_hmac` | api |
| `worker_token` | api, worker |
| `defectdojo_admin_password` | api, DefectDojo initializer — default `changeme` (`admin` / `changeme`) |
| `defectdojo_db_password` | DefectDojo PostgreSQL |
| `defectdojo_database_url` | DefectDojo Django services |
| `defectdojo_secret_key` | DefectDojo Django services |
| `defectdojo_credential_key` | DefectDojo credential encryption |
| `mfa_admin_secret` | local copy of the admin TOTP secret (optional, after `--enable-mfa`) |

## MFA (TOTP)

```bash
docker compose exec api python manage.py bootstrap_admin --enable-mfa
```

Add `otpauth=` / `secret=` to your authenticator app. You can also keep the secret in `secrets/mfa_admin_secret` (gitignored).
