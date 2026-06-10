import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import Redis from 'ioredis';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  totpEnabled: boolean;
}

@Injectable()
export class AuthService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {
    const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.redis = new Redis({ host: url.hostname, port: parseInt(url.port || '6379', 10) });
  }

  // ─── Password login ─────────────────────────────────────────────────────────

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: { include: { permissions: true } } },
    });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Ungültige Anmeldedaten');
    }

    // TOTP required: issue short-lived pending token instead of full tokens
    if (user.totpEnabled) {
      const pendingToken = randomBytes(32).toString('base64url');
      await this.redis.set(`totp_pending:${pendingToken}`, user.id, 'EX', 300);
      return { requiresTotp: true, pendingToken };
    }

    return this.issueTokens(user.id);
  }

  // ─── TOTP completion ─────────────────────────────────────────────────────────

  async loginTotp(pendingToken: string, code: string) {
    const userId = await this.redis.get(`totp_pending:${pendingToken}`);
    if (!userId) throw new UnauthorizedException('Ausstehender Token ungültig oder abgelaufen');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) throw new UnauthorizedException();

    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(user.totpSecret) });
    const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
    if (delta === null) throw new UnauthorizedException('Ungültiger TOTP-Code');

    await this.redis.del(`totp_pending:${pendingToken}`);
    return this.issueTokens(userId);
  }

  // ─── TOTP setup ──────────────────────────────────────────────────────────────

  async totpSetup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabled) throw new BadRequestException('TOTP bereits aktiviert');

    const secret = new OTPAuth.Secret();
    const totp = new OTPAuth.TOTP({
      issuer: 'VCP',
      label: user.email,
      secret,
    });
    const uri = totp.toString();

    // Store pending secret (not yet active until confirmed)
    await this.redis.set(`totp_setup:${userId}`, secret.base32, 'EX', 600);

    const qrDataUrl = await QRCode.toDataURL(uri);
    return { secret: secret.base32, qrDataUrl, otpauthUri: uri };
  }

  async totpConfirm(userId: string, code: string) {
    const secretBase32 = await this.redis.get(`totp_setup:${userId}`);
    if (!secretBase32) throw new BadRequestException('Setup-Session abgelaufen — bitte neu starten');

    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secretBase32) });
    const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
    if (delta === null) throw new BadRequestException('Ungültiger TOTP-Code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secretBase32, totpEnabled: true },
    });
    await this.redis.del(`totp_setup:${userId}`);
    return { ok: true };
  }

  async totpDisable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabled || !user.totpSecret) {
      throw new BadRequestException('TOTP ist nicht aktiviert');
    }
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(user.totpSecret) });
    const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
    if (delta === null) throw new UnauthorizedException('Ungültiger TOTP-Code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabled: false },
    });
    return { ok: true };
  }

  async updateProfile(userId: string, name: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: { id: true, email: true, name: true },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Aktuelles Passwort falsch');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }) },
    });
    return { ok: true };
  }

  // ─── Tokens & session ────────────────────────────────────────────────────────

  async refresh(refreshToken: string) {
    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh-Token ungültig');
    }
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.issueTokens(stored.userId);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash: this.hash(refreshToken) } });
  }

  async resolveUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: true } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      permissions: user.role.permissions.map((p) => p.permissionId),
      totpEnabled: user.totpEnabled,
    };
  }

  private async issueTokens(userId: string) {
    const user = await this.resolveUser(userId);
    const accessToken = await this.jwt.signAsync({ sub: user.id });
    const refreshToken = randomBytes(48).toString('base64url');
    const ttl = parseInt(process.env.JWT_REFRESH_TTL ?? '604800', 10);
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hash(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return { accessToken, refreshToken, user };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
