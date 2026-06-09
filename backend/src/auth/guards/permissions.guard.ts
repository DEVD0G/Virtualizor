import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user: AuthenticatedUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) return false;
    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length) {
      throw new ForbiddenException(`Fehlende Berechtigung: ${missing.join(', ')}`);
    }
    return true;
  }
}
