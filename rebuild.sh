#!/usr/bin/env bash
#
# VCP Rebuild — nach einem Update (git pull oder hochgeladene Dateien)
# Images neu bauen, Container neu starten, auf Health warten.
#
#   ./rebuild.sh              # alles neu bauen + starten
#   ./rebuild.sh backend      # nur einen Service neu bauen
#   ./rebuild.sh --pull       # vorher git pull, dann alles neu bauen
#
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

log() { echo -e "\e[1;32m[vcp]\e[0m $*"; }
err() { echo -e "\e[1;31m[vcp]\e[0m $*" >&2; exit 1; }

[[ -f docker-compose.yml ]] || err "docker-compose.yml nicht gefunden."

SERVICES=()
for arg in "$@"; do
  case "$arg" in
    --pull)
      log "Hole Updates (git pull)..."
      git pull --ff-only
      ;;
    backend|frontend)
      SERVICES+=("$arg")
      ;;
    *)
      err "Unbekanntes Argument: $arg (erlaubt: --pull, backend, frontend)"
      ;;
  esac
done

log "Baue Images neu..."
docker compose build "${SERVICES[@]}"

log "Starte Container neu..."
docker compose up -d "${SERVICES[@]}"

log "Warte auf Backend (Health-Check)..."
HEALTHY=0
for i in $(seq 1 60); do
  if docker compose ps backend --format '{{.Health}}' 2>/dev/null | grep -q healthy; then
    HEALTHY=1
    break
  fi
  sleep 2
done

if [[ $HEALTHY -eq 1 ]]; then
  log "Backend gesund."
else
  err "Backend wurde nicht gesund — Logs prüfen: docker compose logs backend --tail=50"
fi

docker compose ps

log "Räume ungenutzte Images auf..."
docker image prune -f >/dev/null

log "Rebuild abgeschlossen."
