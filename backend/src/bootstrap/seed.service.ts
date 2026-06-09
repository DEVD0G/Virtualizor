import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

const PERMISSIONS: Record<string, string> = {
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
  customer: ['vm.read', 'vm.power', 'vm.snapshot', 'vm.console', 'backup.read'],
};

/** Idempotentes Seeding beim Start: Permissions, Systemrollen, Admin, Default-Template. */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    for (const [id, label] of Object.entries(PERMISSIONS)) {
      await this.prisma.permission.upsert({ where: { id }, update: { label }, create: { id, label } });
    }
    for (const [name, perms] of Object.entries(ROLES)) {
      const role = await this.prisma.role.upsert({
        where: { name },
        update: {},
        create: { name, isSystem: true },
      });
      for (const permissionId of perms) {
        await this.prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId } },
          update: {},
          create: { roleId: role.id, permissionId },
        });
      }
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const existing = await this.prisma.user.findUnique({ where: { email: adminEmail } });
      if (!existing) {
        const adminRole = await this.prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
        await this.prisma.user.create({
          data: {
            email: adminEmail,
            name: 'Administrator',
            passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
            roleId: adminRole.id,
          },
        });
        this.logger.log(`Admin-User ${adminEmail} angelegt`);
      }
    }

    await this.prisma.template.upsert({
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
}
