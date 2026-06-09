import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() name: string;
  @IsString() @MinLength(10) password: string;
  @IsUUID() roleId: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MinLength(10) password?: string;
}

@Controller('users')
@RequirePermissions('user.manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }
}
