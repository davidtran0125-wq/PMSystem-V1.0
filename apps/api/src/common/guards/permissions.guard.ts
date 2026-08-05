import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuthUser,
  PERMISSIONS_KEY,
  ROLES_KEY,
  IS_PUBLIC_KEY,
} from '../decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length && !requiredRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) throw new ForbiddenException('Missing authentication context');

    if (requiredRoles?.length) {
      const ok = requiredRoles.some((role) => user.roles.includes(role));
      if (!ok) throw new ForbiddenException('Insufficient role');
    }

    if (required?.length) {
      const ok = required.every((perm) => user.permissions.includes(perm));
      if (!ok) throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
