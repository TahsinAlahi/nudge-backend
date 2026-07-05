import { User } from '@/generated/prisma/client';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type UserRequest = Omit<User, 'password'>;

export const CurrentUser = createParamDecorator(
  (data: keyof Omit<User, 'password'> | undefined, ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ user?: Omit<User, 'password'> }>();
    const user = req.user;
    return data ? user?.[data] : user;
  }
);
