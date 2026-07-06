import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

/**
 * Global JWT guard registered as APP_GUARD in AppModule.
 *
 * Every route requires a valid JWT by default. Routes decorated with `@Public()`
 * skip authentication entirely, allowing unauthenticated access.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Determines whether the current request is allowed to proceed.
   *
   * Checks for the 'isPublic' metadata key set by the `@Public()` decorator.
   * If present, the request bypasses JWT validation. Otherwise the standard
   * Passport JWT authentication flow runs.
   *
   * @param context - The execution context wrapping the incoming request.
   * @returns true if the route is public, otherwise delegates to the parent AuthGuard.
   */
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
