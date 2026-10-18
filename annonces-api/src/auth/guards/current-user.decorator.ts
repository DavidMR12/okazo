import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedRequest, AuthUser } from '../auth.types';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
