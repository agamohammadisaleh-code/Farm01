import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { AuthedRequest, JwtPayload } from "./auth.types";

/** بررسی توکن دسترسی Bearer و سوار کردن کاربر روی درخواست */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("برای دسترسی باید وارد شوید.");
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        farmId: payload.farmId,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException("نشست منقضی شده است؛ دوباره وارد شوید.");
    }
  }
}
