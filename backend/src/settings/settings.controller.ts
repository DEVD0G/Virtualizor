import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

class SettingEntry {
  @IsString() key: string;
  @IsString() value: string;
}

class UpdateSettingsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SettingEntry)
  settings: SettingEntry[];
}

@Controller('settings')
@RequirePermissions('user.manage')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.setting.findMany();
  }

  @Patch()
  async update(@Body() dto: UpdateSettingsDto) {
    await Promise.all(
      dto.settings.map((s) =>
        this.prisma.setting.upsert({
          where: { key: s.key },
          create: { key: s.key, value: s.value },
          update: { value: s.value },
        }),
      ),
    );
    return this.prisma.setting.findMany();
  }
}
