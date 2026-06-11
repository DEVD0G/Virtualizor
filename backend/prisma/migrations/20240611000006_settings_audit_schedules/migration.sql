CREATE TABLE IF NOT EXISTS "settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "cron_schedules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "nodeId" TEXT,
  "cronExpr" TEXT NOT NULL,
  "keepLast" INTEGER NOT NULL DEFAULT 3,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cron_schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cron_schedules_targetId_idx" ON "cron_schedules"("targetId");
