import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@farm/domain";
import { ROLES_KEY } from "../common/roles";
import type { AuthedRequest } from "./auth.types";

/** کنترل دسترسی مبتنی بر نقش (RBAC) */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const role = req.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException("نقش شما اجازه این عملیات را ندارد.");
    }
    return true;
  }
}
