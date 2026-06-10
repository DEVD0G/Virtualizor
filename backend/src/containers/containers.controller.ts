import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { ContainersService, CreateContainerDto } from './containers.service';

class CreateContainerBodyDto {
  @Matches(/^[a-z0-9][-a-z0-9]{2,62}$/, { message: 'Name: 3-63 Zeichen, a-z 0-9 Bindestrich' })
  name: string;

  @IsOptional() @IsUUID() nodeId?: string;
  @IsInt() @Min(1) @Max(128) vcpus: number;
  @IsInt() @Min(128) @Max(1048576) memoryMb: number;
  @IsInt() @Min(5) @Max(4096) diskGb: number;
  @IsString() osTemplate: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() description?: string;
}

@Controller('containers')
export class ContainersController {
  constructor(private readonly svc: ContainersService) {}

  @Get()
  @RequirePermissions('vm.read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user);
  }

  @Post()
  @RequirePermissions('vm.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContainerBodyDto) {
    return this.svc.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('vm.read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.get(user, id);
  }

  @Post(':id/start')
  @RequirePermissions('vm.manage')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.power(user, id, 'start');
  }

  @Post(':id/stop')
  @RequirePermissions('vm.manage')
  stop(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.power(user, id, 'stop');
  }

  @Delete(':id')
  @RequirePermissions('vm.delete')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }
}
