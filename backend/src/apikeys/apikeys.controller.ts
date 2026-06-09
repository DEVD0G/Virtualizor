import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post,
} from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

class CreateApiKeyDto {
  @IsString() name: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) scopes: string[];
}

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.apiKey.findMany({
      where: user.permissions.includes('user.manage') ? {} : { userId: user.id },
      select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, createdAt: true },
    });
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApiKeyDto) {
    // Scopes dürfen die eigenen Permissions nicht überschreiten
    const invalid = dto.scopes.filter((s) => !user.permissions.includes(s));
    if (invalid.length) {
      throw new BadRequestException(`Scopes außerhalb der eigenen Berechtigungen: ${invalid.join(', ')}`);
    }
    const id = randomBytes(6).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const key = `vcp_${id}_${secret}`;
    await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        prefix: `vcp_${id}`,
        keyHash: createHash('sha256').update(key).digest('hex'),
        userId: user.id,
        scopes: dto.scopes,
      },
    });
    // Der Klartext-Key wird genau einmal zurückgegeben
    return { key };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const where = user.permissions.includes('user.manage') ? { id } : { id, userId: user.id };
    const found = await this.prisma.apiKey.findFirst({ where });
    if (!found) throw new NotFoundException();
    await this.prisma.apiKey.delete({ where: { id } });
    return { ok: true };
  }
}
