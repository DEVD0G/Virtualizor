-- AlterTable: VM-Hardware-Felder
ALTER TABLE "vms" ADD COLUMN IF NOT EXISTS "bios" TEXT NOT NULL DEFAULT 'seabios';
ALTER TABLE "vms" ADD COLUMN IF NOT EXISTS "cpuSockets" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "vms" ADD COLUMN IF NOT EXISTS "cpuCores" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "vms" ADD COLUMN IF NOT EXISTS "cpuThreads" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "vms" ADD COLUMN IF NOT EXISTS "bootOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable: PCI-Passthrough
CREATE TABLE IF NOT EXISTS "pci_passthroughs" (
    "id"       TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "vmId"     TEXT NOT NULL,
    "domain"   TEXT NOT NULL DEFAULT '0x0000',
    "bus"      TEXT NOT NULL,
    "slot"     TEXT NOT NULL,
    "function" TEXT NOT NULL,
    "label"    TEXT,
    CONSTRAINT "pci_passthroughs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pci_passthroughs" ADD CONSTRAINT "pci_passthroughs_vmId_fkey"
    FOREIGN KEY ("vmId") REFERENCES "vms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
