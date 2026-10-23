import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthUser, AuthedRequest } from "./auth.types";

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
