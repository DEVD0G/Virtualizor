#!/usr/bin/env bash
#
# Let's Encrypt für das VCP-Panel — Webroot-Modus über den laufenden nginx.
# Certbot läuft als Docker-Container, keine Host-Pakete nötig.
#
#   ./scripts/letsencrypt.sh                  # Erstausstellung (Domain/E-Mail aus .env)
#   ./scripts/letsencrypt.sh --renew          # Erneuerung (für Cron)
#   ./scripts/letsencrypt.sh example.com mail@example.com   # explizit
#
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

log() { echo -e "\e[1;32m[vcp-le]\e[0m $*"; }
err() { echo -e "\e[1;31m[vcp-le]\e[0m $*" >&2; exit 1; }

[[ -f .env ]] || err ".env nicht gefunden — zuerst install.sh ausführen."

RENEW=0
if [[ "${1:-}" == "--renew" ]]; then RENEW=1; shift; fi

DOMAIN="${1:-$(grep ^PANEL_DOMAIN= .env | cut -d= -f2)}"
EMAIL="${2:-$(grep ^ADMIN_EMAIL= .env | cut -d= -f2)}"
[[ -n "$DOMAIN" && "$DOMAIN" != "localhost" ]] \
  || err "PANEL_DOMAIN ist '$DOMAIN' — Let's Encrypt braucht eine öffentliche Domain."

mkdir -p data/certbot/www data/certbot/conf

# nginx muss laufen und Port 80 für die HTTP-01-Challenge bedienen.
docker compose ps frontend --format '{{.State}}' 2>/dev/null | grep -q running \
  || err "Frontend-Container läuft nicht — zuerst 'docker compose up -d'."

deploy_cert() {
  local live="data/certbot/conf/live/${DOMAIN}"
  [[ -f "${live}/fullchain.pem" ]] || err "Kein Zertifikat unter ${live} gefunden."
  cp -L "${live}/fullchain.pem" certs/panel-tls.crt
  cp -L "${live}/privkey.pem"   certs/panel-tls.key
  chmod 600 certs/panel-tls.key
  docker compose exec -T frontend nginx -s reload
  log "Zertifikat installiert und nginx neu geladen."
}

if [[ $RENEW -eq 1 ]]; then
  log "Prüfe Erneuerung für ${DOMAIN}..."
  docker run --rm \
    -v "$DIR/data/certbot/www:/var/www/certbot" \
    -v "$DIR/data/certbot/conf:/etc/letsencrypt" \
    certbot/certbot renew --webroot -w /var/www/certbot --quiet
  deploy_cert
  exit 0
fi

log "Fordere Zertifikat für ${DOMAIN} an (Webroot über laufenden nginx)..."
docker run --rm \
  -v "$DIR/data/certbot/www:/var/www/certbot" \
  -v "$DIR/data/certbot/conf:/etc/letsencrypt" \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" --agree-tos --no-eff-email \
  --non-interactive --keep-until-expiring

deploy_cert

# Auto-Renewal: täglich um 03:17, erneuert nur wenn <30 Tage Restlaufzeit.
CRON_FILE=/etc/cron.d/vcp-letsencrypt
if [[ -w /etc/cron.d ]] || [[ $EUID -eq 0 ]]; then
  cat > "$CRON_FILE" <<EOF
17 3 * * * root cd ${DIR} && ./scripts/letsencrypt.sh --renew >> /var/log/vcp-letsencrypt.log 2>&1
EOF
  chmod 644 "$CRON_FILE"
  log "Auto-Renewal eingerichtet: ${CRON_FILE}"
else
  log "Hinweis: für Auto-Renewal als root ausführen oder Cron manuell anlegen:"
  log "  17 3 * * * cd ${DIR} && ./scripts/letsencrypt.sh --renew"
fi

log "Fertig! https://${DOMAIN}/ nutzt jetzt Let's Encrypt."
