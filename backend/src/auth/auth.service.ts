import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: { include: { permissions: true } } },
    });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Ungültige Anmeldedaten');
    }
    return this.issueTokens(user.id);
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh-Token ungültig');
    }
    // Rotation: alten Token sofort entwerten
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
