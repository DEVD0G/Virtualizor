import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService, AuthenticatedUser } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

class RefreshDto {
  @IsString() refreshToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
