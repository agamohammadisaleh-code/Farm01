import type { Role } from "@farm/domain";
import type { Request } from "express";

export interface JwtPayload {
  /** شناسه کاربر */
  sub: string;
  email: string;
  name: string;
  /** مزرعه فعال این نشست */
  farmId: string;
  role: Role;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  farmId: string;
  role: Role;
}

export interface AuthedRequest extends Request {
  user: AuthUser;
}
