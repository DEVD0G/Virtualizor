import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true, email: true, name: true, isActive: true, createdAt: true,
        role: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(data: { email: string; name: string; password: string; roleId: string }) {
    const exists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new ConflictException('E-Mail bereits vergeben');
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        roleId: data.roleId,
        passwordHash: await argon2.hash(data.password, { type: argon2.argon2id }),
      },
      select: { id: true, email: true, name: true },
    });
    return user;
  }

  async update(
    id: string,
    data: { name?: string; roleId?: string; isActive?: boolean; password?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    return this.prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        roleId: data.roleId,
        isActive: data.isActive,
        ...(data.password
          ? { passwordHash: await argon2.hash(data.password, { type: argon2.argon2id }) }
          : {}),
      },
      select: { id: true, email: true, name: true, isActive: true },
    });
  }

  async remove(id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}
