#!/bin/sh
set -e

# Migrationen anwenden. Bestehende Datenbanken aus der Zeit vor dem
# Migrations-Workflow (per `db push` erzeugt) haben keine Migrations-
# Historie und lösen P3005 aus. In dem Fall: Schema einmalig per
# `db push` synchronisieren und alle vorhandenen Migrationen als
# angewendet markieren (Baseline). Danach läuft `migrate deploy` bei
# jedem Start normal.
if ! npx prisma migrate deploy; then
  echo "[vcp] Keine Migrations-Historie gefunden — baseline bestehende Datenbank..."
  npx prisma db push --skip-generate
  for dir in prisma/migrations/*/; do
    name="$(basename "$dir")"
    [ "$name" = "migration_lock.toml" ] && continue
    npx prisma migrate resolve --applied "$name" || true
  done
fi

node dist/main.js
