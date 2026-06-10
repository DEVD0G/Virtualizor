import {
  Body, Controller, Delete, Get, NotFoundException, Param, Post,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

class CreateTemplateDto {
  @IsString() id: string;
  @IsString() name: string;
  @IsUrl() sourceUrl: string;
  @IsOptional() @IsString() sha256?: string;
  @IsOptional() @IsString() osType?: string;
  @IsOptional() @IsInt() @Min(5) minDiskGb?: number;
}

class CreateIsoDto {
  @IsString() name: string;
  @IsUrl() sourceUrl: string;
  @IsOptional() @IsString() sha256?: string;
}

@Controller('storage')
export class StorageController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Templates ─────────────────────────────────────────────────────────────

  @Get('templates')
  @Public()
  listTemplates() {
    return this.prisma.template.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('templates')
  @RequirePermissions('storage.manage')
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.prisma.template.create({
      data: {
        id: dto.id,
        name: dto.name,
        sourceUrl: dto.sourceUrl,
        sha256: dto.sha256 ?? '',
        osType: dto.osType ?? 'linux',
        minDiskGb: dto.minDiskGb ?? 10,
      },
    });
  }

  @Delete('templates/:id')
  @RequirePermissions('storage.manage')
  async deleteTemplate(@Param('id') id: string) {
    const inUse = await this.prisma.vm.count({ where: { templateId: id } });
    if (inUse > 0) {
      throw new NotFoundException(`Template wird noch von ${inUse} VMs verwendet`);
    }
    await this.prisma.template.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Template nicht gefunden');
    });
    return { ok: true };
  }

  // ─── ISOs ──────────────────────────────────────────────────────────────────

  @Get('isos')
  @Public()
  listIsos() {
    return this.prisma.iso.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('isos')
  @RequirePermissions('storage.manage')
  createIso(@Body() dto: CreateIsoDto) {
    return this.prisma.iso.create({
      data: {
        name: dto.name,
        sourceUrl: dto.sourceUrl,
        sha256: dto.sha256 ?? '',
      },
    });
  }

  @Delete('isos/:id')
  @RequirePermissions('storage.manage')
  async deleteIso(@Param('id') id: string) {
    await this.prisma.iso.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('ISO nicht gefunden');
    });
    return { ok: true };
  }
}
