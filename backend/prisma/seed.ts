import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

export const PERMISSIONS: Record<string, string> = {
  'vm.read': 'VMs anzeigen',
  'vm.create': 'VMs erstellen',
  'vm.delete': 'VMs löschen',
  'vm.power': 'VMs starten/stoppen',
  'vm.snapshot': 'Snapshots verwalten',
  'vm.console': 'VM-Konsole öffnen',
  'vm.firewall': 'VM-Firewall verwalten',
  'node.read': 'Nodes anzeigen',
  'node.manage': 'Nodes verwalten',
  'network.read': 'Netzwerke anzeigen',
  'network.manage': 'Netzwerke verwalten',
  'storage.read': 'Storage anzeigen',
  'storage.manage': 'Storage/ISOs/Templates verwalten',
  'backup.read': 'Backups anzeigen',
  'backup.manage': 'Backups verwalten',
  'user.manage': 'Benutzer & Rollen verwalten',
  'audit.read': 'Audit-Log lesen',
  'license.read': 'Lizenzstatus anzeigen',
  'license.manage': 'Lizenz aktivieren/aktualisieren',
};

const ROLES: Record<string, string[]> = {
  admin: Object.keys(PERMISSIONS),
  operator: [
    'vm.read', 'vm.create', 'vm.delete', 'vm.power', 'vm.snapshot', 'vm.console',
    'vm.firewall', 'node.read', 'network.read', 'storage.read', 'backup.read',
    'backup.manage', 'license.read',
  ],
  customer: [
    'vm.read', 'vm.power', 'vm.snapshot', 'vm.console', 'backup.read',
  ],
};

async function main() {
  for (const [id, label] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { id }, update: { label }, create: { id, label } });
  }

  for (const [name, perms] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, isSystem: true },
    });
    for (const permissionId of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email: adminEmail,
          name: 'Administrator',
          passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
          roleId: adminRole.id,
        },
      });
      console.log(`Admin-User ${adminEmail} angelegt.`);
    }
  }

  await prisma.template.upsert({
    where: { id: 'ubuntu-24.04' },
    update: {},
    create: {
      id: 'ubuntu-24.04',
      name: 'Ubuntu 24.04 LTS (cloud image)',
      sourceUrl: 'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img',
      sha256: '',
      minDiskGb: 10,
    },
  });
}

main().finally(() => prisma.$disconnect());
