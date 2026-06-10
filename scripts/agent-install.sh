#!/usr/bin/env bash
#
# VCP Node Agent Installer — Ubuntu 24.04 (bare metal Hypervisor-Host)
# Installiert KVM/QEMU/libvirt + den Agent, registriert den Node am Panel.
#
set -euo pipefail

PANEL_URL=""
JOIN_TOKEN=""
AGENT_PORT=8443
BRIDGE="${BRIDGE:-vmbr0}"

usage() { echo "Usage: $0 --panel-url https://panel.example.com --join-token <TOKEN>"; exit 1; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel-url) PANEL_URL="$2"; shift 2;;
    --join-token) JOIN_TOKEN="$2"; shift 2;;
    *) usage;;
  esac
done
[[ -n "$PANEL_URL" && -n "$JOIN_TOKEN" ]] || usage
[[ $EUID -eq 0 ]] || { echo "Bitte als root ausführen."; exit 1; }

log() { echo -e "\e[1;32m[vcp-agent]\e[0m $*"; }

# --- KVM-Fähigkeit prüfen -----------------------------------------------------
grep -qE 'vmx|svm' /proc/cpuinfo || { echo "CPU unterstützt keine Virtualisierung (VT-x/AMD-V)."; exit 1; }

# --- Pakete -------------------------------------------------------------------
log "Installiere KVM/QEMU/libvirt..."
apt-get update -qq
apt-get install -y -qq qemu-kvm qemu-utils libvirt-daemon-system libvirt-clients \
  genisoimage curl jq openssl golang-go nftables
systemctl enable --now libvirtd

# --- Agent bauen/installieren ---------------------------------------------------
log "Baue Agent..."
SRC_DIR="$(cd "$(dirname "$0")/../agent" 2>/dev/null && pwd || true)"
if [[ -z "$SRC_DIR" || ! -f "$SRC_DIR/go.mod" ]]; then
  echo "Agent-Quellcode nicht gefunden — Script aus dem Repo-Checkout ausführen."; exit 1
fi
(cd "$SRC_DIR" && go build -o /usr/local/bin/vcp-agent ./cmd/vcp-agent)

mkdir -p /etc/vcp /var/lib/vcp/{images,isos,cloudinit}

# --- Node-Registrierung: CSR erzeugen, vom Panel signieren lassen ---------------
log "Registriere Node am Panel..."
HOSTNAME_FQDN="$(hostname -f 2>/dev/null || hostname)"
FINGERPRINT="sha256:$( { cat /etc/machine-id; grep -m1 'model name' /proc/cpuinfo; \
  ip -o link | awk '{print $17}' | sort; } | sha256sum | cut -d' ' -f1)"

openssl ecparam -name prime256v1 -genkey -noout -out /etc/vcp/agent.key
openssl req -new -key /etc/vcp/agent.key -subj "/CN=${HOSTNAME_FQDN}" -out /tmp/agent.csr
CSR_B64="$(base64 -w0 /tmp/agent.csr)"; rm /tmp/agent.csr

RESP="$(curl -fsS -X POST "${PANEL_URL}/api/v1/nodes/join" \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"${JOIN_TOKEN}\",\"csr\":\"${CSR_B64}\",\"fingerprint\":\"${FINGERPRINT}\",\"hostname\":\"${HOSTNAME_FQDN}\",\"agentPort\":${AGENT_PORT}}")" \
  || { echo "Registrierung fehlgeschlagen."; exit 1; }

echo "$RESP" | jq -r '.certificate' | base64 -d > /etc/vcp/agent.crt
echo "$RESP" | jq -r '.caCertificate' | base64 -d > /etc/vcp/ca.crt
NODE_ID="$(echo "$RESP" | jq -r '.nodeId')"
chmod 600 /etc/vcp/agent.key

# --- Agent-Konfiguration ---------------------------------------------------------
cat > /etc/vcp/agent.yaml <<EOF
nodeId: ${NODE_ID}
panelUrl: ${PANEL_URL}
listenAddr: 0.0.0.0:${AGENT_PORT}
tls:
  cert: /etc/vcp/agent.crt
  key: /etc/vcp/agent.key
  ca: /etc/vcp/ca.crt
storage:
  imagesDir: /var/lib/vcp/images
  isosDir: /var/lib/vcp/isos
  cloudInitDir: /var/lib/vcp/cloudinit
network:
  defaultBridge: ${BRIDGE}
heartbeatIntervalSeconds: 10
EOF
chmod 600 /etc/vcp/agent.yaml

# --- systemd ----------------------------------------------------------------------
cp "$SRC_DIR/deploy/vcp-agent.service" /etc/systemd/system/vcp-agent.service
systemctl daemon-reload
systemctl enable --now vcp-agent

log "Agent installiert und registriert (Node-ID: ${NODE_ID})."
log "Hinweis: Bridge '${BRIDGE}' muss konfiguriert sein (netplan) für bridged Networking."
