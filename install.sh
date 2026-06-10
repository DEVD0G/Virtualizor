#!/usr/bin/env bash
#
# VCP Control Panel Installer — Ubuntu 24.04
# Installiert Docker, generiert Secrets + mTLS-CA und startet das Panel.
#
set -euo pipefail

VCP_DIR="${VCP_DIR:-/opt/vcp}"
REPO_URL="${REPO_URL:-https://github.com/devd0g/virtualizor.git}"
BRANCH="${BRANCH:-main}"

log()  { echo -e "\e[1;32m[vcp]\e[0m $*"; }
err()  { echo -e "\e[1;31m[vcp]\e[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || err "Bitte als root ausführen (sudo)."

. /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] \
  || log "Warnung: getestet nur auf Ubuntu 24.04 (gefunden: ${ID:-?} ${VERSION_ID:-?})"

# --- Docker installieren (offizielles Repo) ---------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installiere Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg git openssl uuid-runtime
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
else
  log "Docker bereits installiert."
  apt-get install -y -qq git openssl uuid-runtime >/dev/null
fi

# --- Repo holen --------------------------------------------------------------
if [[ -f "$(dirname "$0")/docker-compose.yml" ]]; then
  VCP_DIR="$(cd "$(dirname "$0")" && pwd)"
  log "Verwende lokales Repo: $VCP_DIR"
elif [[ -d "$VCP_DIR/.git" ]]; then
  log "Aktualisiere $VCP_DIR..."
  git -C "$VCP_DIR" pull --ff-only
else
  log "Klone Repo nach $VCP_DIR..."
  git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$VCP_DIR"
fi
cd "$VCP_DIR"

# --- .env generieren ---------------------------------------------------------
if [[ ! -f .env ]]; then
  log "Generiere .env mit zufälligen Secrets..."
  PG_PASS="$(openssl rand -hex 24)"
  JWT="$(openssl rand -hex 64)"
  ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=')"
  INSTANCE_ID="$(uuidgen)"
  read -rp "Panel-Domain (z.B. panel.example.com) [localhost]: " DOMAIN
  DOMAIN="${DOMAIN:-localhost}"
  read -rp "Admin-E-Mail [admin@${DOMAIN}]: " ADMIN_EMAIL
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"
  read -rp "License API URL [https://license.example.com]: " LIC_URL
  LIC_URL="${LIC_URL:-https://license.example.com}"
  read -rp "License Server Public Key (base64, leer = später): " LIC_PUB

  sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASS}|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://vcp:${PG_PASS}@postgres:5432/vcp|" \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" \
      -e "s|^PANEL_DOMAIN=.*|PANEL_DOMAIN=${DOMAIN}|" \
      -e "s|^PANEL_INSTANCE_ID=.*|PANEL_INSTANCE_ID=${INSTANCE_ID}|" \
      -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=${ADMIN_EMAIL}|" \
      -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PASS}|" \
      -e "s|^LICENSE_API_URL=.*|LICENSE_API_URL=${LIC_URL}|" \
      -e "s|^LICENSE_PUBLIC_KEY=.*|LICENSE_PUBLIC_KEY=${LIC_PUB}|" \
      .env.example > .env
  chmod 600 .env
  log "Initiales Admin-Passwort: ${ADMIN_PASS}  (in .env hinterlegt — bitte nach Login ändern)"
fi

# --- mTLS-CA + Panel-TLS erzeugen --------------------------------------------
if [[ ! -f certs/ca.crt ]]; then
  log "Erzeuge interne CA und Zertifikate..."
  ./scripts/gen-certs.sh "$(grep ^PANEL_DOMAIN= .env | cut -d= -f2)"
fi

# --- Start --------------------------------------------------------------------
log "Baue und starte Container..."
docker compose up -d --build

log "Warte auf Datenbank..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U vcp >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Migrationen werden vom Backend-Entrypoint selbst angewendet
# (inkl. Baseline bestehender Datenbanken) — siehe backend/docker-entrypoint.sh.

log "Warte auf Backend (Health-Check)..."
for i in $(seq 1 60); do
  if docker compose ps backend --format '{{.Health}}' 2>/dev/null | grep -q healthy; then
    break
  fi
  sleep 2
done

DOMAIN="$(grep ^PANEL_DOMAIN= .env | cut -d= -f2)"

# --- Let's Encrypt (optional) --------------------------------------------------
# Webroot-Modus über den laufenden nginx — ersetzt das Self-Signed-Zertifikat.
if [[ "$DOMAIN" != "localhost" && ! -d "data/certbot/conf/live/${DOMAIN}" ]]; then
  read -rp "Let's Encrypt Zertifikat für ${DOMAIN} einrichten? [Y/n]: " LE_ANSWER
  if [[ ! "${LE_ANSWER:-y}" =~ ^[Nn] ]]; then
    ./scripts/letsencrypt.sh || log "Let's Encrypt fehlgeschlagen — Panel läuft mit Self-Signed-Cert. Später: ./scripts/letsencrypt.sh"
  fi
fi

log "Fertig! Panel erreichbar unter: https://${DOMAIN}/"
log "Login: $(grep ^ADMIN_EMAIL= .env | cut -d= -f2)"
log "Nodes hinzufügen: Join-Token im Panel erzeugen, dann auf dem Hypervisor:"
log "  sudo ./scripts/agent-install.sh --panel-url https://${DOMAIN} --join-token <TOKEN>"
