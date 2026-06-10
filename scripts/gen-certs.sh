#!/usr/bin/env bash
# Erzeugt die interne mTLS-CA, das Panel-Client-Zertifikat (Backend → Agents)
# und ein selbstsigniertes TLS-Zertifikat für die Panel-UI.
set -euo pipefail
DOMAIN="${1:-localhost}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "$DIR"
cd "$DIR"

# CA (ECDSA P-256, 10 Jahre)
openssl ecparam -name prime256v1 -genkey -noout -out ca.key
openssl req -new -x509 -key ca.key -sha256 -days 3650 \
  -subj "/CN=VCP Internal CA" -out ca.crt

# Panel-Client-Cert (Backend authentifiziert sich damit bei Agents)
openssl ecparam -name prime256v1 -genkey -noout -out panel-client.key
openssl req -new -key panel-client.key -subj "/CN=vcp-panel" -out panel-client.csr
openssl x509 -req -in panel-client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days 825 -sha256 -extfile <(echo "extendedKeyUsage=clientAuth") -out panel-client.crt
rm panel-client.csr

# Panel-UI TLS (self-signed; in Produktion durch echtes Cert ersetzen)
openssl ecparam -name prime256v1 -genkey -noout -out panel-tls.key
openssl req -new -x509 -key panel-tls.key -sha256 -days 825 \
  -subj "/CN=${DOMAIN}" -addext "subjectAltName=DNS:${DOMAIN}" -out panel-tls.crt

chmod 600 ./*.key
echo "Zertifikate erzeugt in $DIR"
