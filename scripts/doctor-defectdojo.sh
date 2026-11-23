#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

ok() { printf '  [OK]  %s\n' "$*"; }
bad() { printf '  [!!]  %s\n' "$*"; }
info() { printf '  [--]  %s\n' "$*"; }

echo "DefectDojo doctor"
echo "================="

if ! command -v docker >/dev/null 2>&1; then
  bad "Docker is not installed or not in PATH"
  exit 1
fi
ok "Docker is available"

if ! docker compose version >/dev/null 2>&1; then
  bad "Docker Compose is missing (plugin 'docker compose')"
  exit 1
fi
ok "Docker Compose works"

if [[ -f .env ]]; then
  ok ".env file found"
  if grep -Eq '^[[:space:]]*COMPOSE_PROFILES=.*defectdojo' .env; then
    ok ".env has COMPOSE_PROFILES with defectdojo, so a plain 'docker compose up' starts DefectDojo"
  else
    bad ".env does NOT have COMPOSE_PROFILES=defectdojo"
    info "Without it 'docker compose up' does NOT start DefectDojo"
    info "Add the line: COMPOSE_PROFILES=defectdojo"
    info "or always use: docker compose --profile defectdojo up -d"
  fi
else
  bad "Missing .env (copy it: cp .env.example .env)"
fi

echo
echo "Secrets:"
REQUIRED="defectdojo_admin_password defectdojo_db_password defectdojo_database_url defectdojo_secret_key defectdojo_credential_key"
missing=0
for name in ${REQUIRED}; do
  if [[ -f "secrets/${name}" ]]; then
    ok "secrets/${name}"
  else
    bad "missing secrets/${name}"
    missing=1
  fi
done
if [[ "${missing}" -ne 0 ]]; then
  info "Fix: ./scripts/init-secrets.sh"
fi

echo
echo "Profile / containers:"
dd_services="$(docker compose --profile defectdojo config --services 2>/dev/null | grep '^defectdojo' || true)"
if [[ -z "${dd_services}" ]]; then
  bad "Compose does not see any defectdojo* services"
else
  ok "Compose knows the defectdojo* services"
  echo "${dd_services}" | sed 's/^/        /'
fi

running="$(docker compose --profile defectdojo ps --status running --services 2>/dev/null | grep '^defectdojo' || true)"
if [[ -n "${running}" ]]; then
  ok "Running DefectDojo containers:"
  echo "${running}" | sed 's/^/        /'
else
  bad "No defectdojo* container is running"
  info "Fix: ./scripts/start-defectdojo.sh"
fi

echo
echo "Images / network:"
if docker image inspect "registry.defectdojo.com/defectdojo/defectdojo-django:3.5.202" >/dev/null 2>&1; then
  ok "Image defectdojo-django:3.5.202 is available locally"
else
  bad "Local image defectdojo-django:3.5.202 is missing"
  info "A pull from registry.defectdojo.com is required (a firewall or VPN may block it)"
  info "Test: docker pull registry.defectdojo.com/defectdojo/defectdojo-django:3.5.202"
fi

port=8081
if [[ -f .env ]]; then
  port_from_env="$(grep -E '^[[:space:]]*DEFECTDOJO_HTTP_PORT=' .env | tail -1 | cut -d= -f2- | tr -d '[:space:]' || true)"
  if [[ -n "${port_from_env}" ]]; then
    port="${port_from_env}"
  fi
fi
if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
  info "Port ${port} is in use (fine if it is already DefectDojo)"
  lsof -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | sed 's/^/        /' || true
else
  info "Port ${port} looks free (or lsof is not available)"
fi

echo
echo "Initializer (recent logs):"
if docker compose --profile defectdojo ps -a --services 2>/dev/null | grep -q '^defectdojo-initializer$'; then
  docker compose --profile defectdojo logs --tail 30 defectdojo-initializer 2>/dev/null | sed 's/^/        /' || true
  if docker compose --profile defectdojo ps -a defectdojo-initializer 2>/dev/null | grep -Eq 'Exited \(0\)'; then
    ok "Initializer exited with code 0"
  else
    bad "Initializer did not succeed, so uwsgi/nginx will not start"
    info "Common fix after a failed first start:"
    info "  docker compose --profile defectdojo down"
    info "  docker volume rm surfacex_defectdojo_postgres"
    info "  ./scripts/start-defectdojo.sh"
  fi
else
  info "The initializer container did not exist yet"
fi

echo
echo "Quick start:"
cat <<'EOF'
  cd surfacex
  git pull
  cp -n .env.example .env
  # .env must contain the line:
  # COMPOSE_PROFILES=defectdojo
  chmod +x scripts/*.sh
  ./scripts/init-secrets.sh
  ./scripts/start-defectdojo.sh
  # UI: http://localhost:8081  user: admin  password: changeme
EOF
