import { FastifyRequest } from 'fastify';

export type Role = 'user' | 'moderator' | 'admin';

export interface AuthUser {
  id: string;
  role: Role;
}

export type AuthedRequest = FastifyRequest & { user: AuthUser };

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}
