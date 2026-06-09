#!/bin/sh
set -e
# Schema anwenden (idempotent); Migrations-Workflow folgt mit `prisma migrate`
npx prisma db push --skip-generate
node dist/main.js
