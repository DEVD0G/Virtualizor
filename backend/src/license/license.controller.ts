import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MinLength } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { LicenseService } from './license.service';

class ActivateDto {
  @IsString() @MinLength(8) licenseKey: string;
}

@Controller('license')
export class LicenseController {
  constructor(private readonly license: LicenseService) {}

  @Get('status')
  @RequirePermissions('license.read')
  status() {
    return this.license.getState();
  }

  @Post('activate')
  @RequirePermissions('license.manage')
  activate(@Body() dto: ActivateDto) {
    return this.license.activate(dto.licenseKey);
  }

  @Post('refresh')
  @RequirePermissions('license.manage')
  @Throttle({ default: { ttl: 60_000, limit: 1 } })
  refresh() {
    return this.license.refresh();
  }
}
