-- CreateEnum
CREATE TYPE "NodeState" AS ENUM ('joining', 'online', 'offline', 'maintenance');

-- CreateEnum
CREATE TYPE "VmState" AS ENUM ('provisioning', 'stopped', 'running', 'paused', 'error', 'deleting');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('dir', 'zfs', 'nfs', 'iscsi');

-- CreateEnum
CREATE TYPE "NetworkMode" AS ENUM ('bridged', 'nat');

-- CreateEnum
CREATE TYPE "RuleDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "RuleAction" AS ENUM ('accept', 'drop');

-- CreateEnum
CREATE TYPE "BackupState" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "TaskState" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "InstallPhase" AS ENUM ('locked', 'activating', 'active');

-- CreateEnum
CREATE TYPE "AlertMetric" AS ENUM ('cpu_percent', 'mem_used_mb', 'mem_percent');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT[],
    "ipAllowlist" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "agentAddress" TEXT NOT NULL,
    "certSpkiPin" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "state" "NodeState" NOT NULL DEFAULT 'joining',
    "cpuCores" INTEGER NOT NULL DEFAULT 0,
    "memoryMb" INTEGER NOT NULL DEFAULT 0,
    "cpuOvercommit" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    "memOvercommit" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "cpuUsage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memUsedMb" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMP(3),
    "agentVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_metric_samples" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "cpuPercent" DOUBLE PRECISION NOT NULL,
    "memUsedMb" INTEGER NOT NULL,
    "vmsRunning" INTEGER NOT NULL DEFAULT 0,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_metric_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "join_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "join_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "VmState" NOT NULL DEFAULT 'provisioning',
    "vcpus" INTEGER NOT NULL,
    "memoryMb" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "templateId" TEXT,
    "cloudInit" JSONB,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vm_snapshots" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sizeBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vm_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_pools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StorageType" NOT NULL,
    "nodeId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "totalGb" INTEGER NOT NULL DEFAULT 0,
    "usedGb" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "storage_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volumes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeGb" INTEGER NOT NULL,
    "vmId" TEXT,
    "storagePoolId" TEXT NOT NULL,
    "bootOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "isos" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "isos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "osType" TEXT NOT NULL DEFAULT 'linux',
    "minDiskGb" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "networks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "NetworkMode" NOT NULL,
    "bridge" TEXT NOT NULL,
    "vlanTag" INTEGER,
    "cidr" TEXT,

    CONSTRAINT "networks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_pools" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "dns" TEXT[],

    CONSTRAINT "ip_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_addresses" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "nicId" TEXT,
    "reserved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ip_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nics" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "mac" TEXT NOT NULL,

    CONSTRAINT "nics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firewall_rules" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "direction" "RuleDirection" NOT NULL,
    "action" "RuleAction" NOT NULL,
    "protocol" TEXT NOT NULL,
    "portFrom" INTEGER,
    "portTo" INTEGER,
    "cidr" TEXT NOT NULL DEFAULT '0.0.0.0/0',
    "priority" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "firewall_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backups" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "state" "BackupState" NOT NULL DEFAULT 'running',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_schedules" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "intervalHours" INTEGER NOT NULL,
    "targetDir" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "state" "TaskState" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses_cache" (
    "id" TEXT NOT NULL,
    "licenseKeyHash" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licenses_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_activations" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "nodeFingerprint" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "phase" "InstallPhase" NOT NULL DEFAULT 'locked',
    "installId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "licenseKey" TEXT,
    "activatedAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_quotas" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "maxVms" INTEGER,
    "maxVcpus" INTEGER,
    "maxMemoryMb" INTEGER,
    "maxStorageGb" INTEGER,

    CONSTRAINT "resource_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodeId" TEXT,
    "metric" "AlertMetric" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 5,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "webhookId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "firedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "apiKeyId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "sourceIp" TEXT,
    "userAgent" TEXT,
    "outcome" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "nodes_name_key" ON "nodes"("name");

-- CreateIndex
CREATE INDEX "node_metric_samples_nodeId_sampledAt_idx" ON "node_metric_samples"("nodeId", "sampledAt");

-- CreateIndex
CREATE UNIQUE INDEX "join_tokens_tokenHash_key" ON "join_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "vms_name_key" ON "vms"("name");

-- CreateIndex
CREATE INDEX "vms_ownerId_idx" ON "vms"("ownerId");

-- CreateIndex
CREATE INDEX "vms_nodeId_idx" ON "vms"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "vm_snapshots_vmId_name_key" ON "vm_snapshots"("vmId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "storage_pools_nodeId_name_key" ON "storage_pools"("nodeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "isos_name_key" ON "isos"("name");

-- CreateIndex
CREATE UNIQUE INDEX "networks_name_key" ON "networks"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ip_addresses_address_key" ON "ip_addresses"("address");

-- CreateIndex
CREATE INDEX "ip_addresses_poolId_nicId_idx" ON "ip_addresses"("poolId", "nicId");

-- CreateIndex
CREATE UNIQUE INDEX "nics_mac_key" ON "nics"("mac");

-- CreateIndex
CREATE INDEX "tasks_resourceType_resourceId_idx" ON "tasks"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "licenses_cache_licenseKeyHash_key" ON "licenses_cache"("licenseKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "license_activations_nodeId_key" ON "license_activations"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "system_state_installId_key" ON "system_state"("installId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_quotas_roleId_key" ON "resource_quotas"("roleId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhookId_deliveredAt_idx" ON "webhook_deliveries"("webhookId", "deliveredAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_metric_samples" ADD CONSTRAINT "node_metric_samples_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vms" ADD CONSTRAINT "vms_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vms" ADD CONSTRAINT "vms_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vms" ADD CONSTRAINT "vms_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vm_snapshots" ADD CONSTRAINT "vm_snapshots_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "vms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_pools" ADD CONSTRAINT "storage_pools_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "vms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_storagePoolId_fkey" FOREIGN KEY ("storagePoolId") REFERENCES "storage_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_pools" ADD CONSTRAINT "ip_pools_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "networks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "ip_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_nicId_fkey" FOREIGN KEY ("nicId") REFERENCES "nics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nics" ADD CONSTRAINT "nics_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "vms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nics" ADD CONSTRAINT "nics_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "networks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firewall_rules" ADD CONSTRAINT "firewall_rules_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "vms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "vms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "vms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_activations" ADD CONSTRAINT "license_activations_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_quotas" ADD CONSTRAINT "resource_quotas_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

