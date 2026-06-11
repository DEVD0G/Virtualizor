import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';
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

class TotpCompleteDto {
  @IsString() pendingToken: string;
  @IsString() @Length(6, 6) code: string;
}

class TotpCodeDto {
  @IsString() @Length(6, 6) code: string;
}

class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(10) newPassword: string;
}

class UpdateProfileDto {
  @IsString() @MinLength(1) name: string;
}

class ForgotPasswordDto {
  @IsEmail() email: string;
}

class ResetPasswordDto {
  @IsString() token: string;
  @IsString() @MinLength(8) newPassword: string;
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
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Post('login/totp')
  loginTotp(@Body() dto: TotpCompleteDto) {
    return this.auth.loginTotp(dto.pendingToken, dto.code);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { ok: true };
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

  // ─── TOTP setup (authenticated) ─────────────────────────────────────────────

  @Post('totp/setup')
  totpSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.totpSetup(user.id);
  }

  @Post('totp/confirm')
  totpConfirm(@CurrentUser() user: AuthenticatedUser, @Body() dto: TotpCodeDto) {
    return this.auth.totpConfirm(user.id, dto.code);
  }

  @Delete('totp')
  totpDisable(@CurrentUser() user: AuthenticatedUser, @Body() dto: TotpCodeDto) {
    return this.auth.totpDisable(user.id, dto.code);
  }

  @Post('change-password')
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto.name);
  }

  // ─── Session management ──────────────────────────────────────────────────────

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listSessions(user.id);
  }

  @Delete('sessions')
  @HttpCode(204)
  revokeAllSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.revokeAllSessions(user.id);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.auth.revokeSession(user.id, id);
  }
}
