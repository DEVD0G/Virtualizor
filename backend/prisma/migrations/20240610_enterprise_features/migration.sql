-- Add tags, description, and mountedIsoId to vms table
ALTER TABLE "vms" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "vms" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "vms" ADD COLUMN IF NOT EXISTS "mountedIsoId" TEXT;

-- AddForeignKey for mountedIsoId
DO $$ BEGIN
  ALTER TABLE "vms"
    ADD CONSTRAINT "vms_mountedIsoId_fkey"
    FOREIGN KEY ("mountedIsoId") REFERENCES "isos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add PortForwardProtocol enum
DO $$ BEGIN
  CREATE TYPE "PortForwardProtocol" AS ENUM ('tcp', 'udp');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add ContainerState enum
DO $$ BEGIN
  CREATE TYPE "ContainerState" AS ENUM ('provisioning', 'stopped', 'running', 'error', 'deleting');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable containers
CREATE TABLE IF NOT EXISTS "containers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "ContainerState" NOT NULL DEFAULT 'provisioning',
    "vcpus" INTEGER NOT NULL,
    "memoryMb" INTEGER NOT NULL,
    "diskGb" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "osTemplate" TEXT NOT NULL,
    "ipAddress" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable port_forward_rules
CREATE TABLE IF NOT EXISTS "port_forward_rules" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "description" TEXT,
    "protocol" "PortForwardProtocol" NOT NULL DEFAULT 'tcp',
    "externalPort" INTEGER NOT NULL,
    "internalIp" TEXT NOT NULL,
    "internalPort" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "port_forward_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "containers_name_key" ON "containers"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "port_forward_rules_networkId_protocol_externalPort_key"
    ON "port_forward_rules"("networkId", "protocol", "externalPort");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "containers"
    ADD CONSTRAINT "containers_nodeId_fkey"
    FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "containers"
    ADD CONSTRAINT "containers_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "port_forward_rules"
    ADD CONSTRAINT "port_forward_rules_networkId_fkey"
    FOREIGN KEY ("networkId") REFERENCES "networks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
