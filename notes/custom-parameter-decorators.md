# Custom Parameter Decorators — @CurrentUser()

## Why did we need this?

`req.user` is added by Passport at runtime, but TypeScript doesn't know about
it. Writing `@Request() req` and accessing `req.user.email` gives TS errors:

```typescript
// ❌ Property 'user' does not exist on type 'Request'
async profile(@Request() req) {
  return req.user.email;
}
```

A custom parameter decorator extracts `req.user` and lets you type the result
directly on the parameter:

```typescript
// ✅ user is properly typed
async profile(@CurrentUser() user: UserWithoutPassword) {
  return user.email;
}
```

---

## createParamDecorator

### What it is

`createParamDecorator` is a NestJS helper that creates decorators which inject
values extracted from the request into controller parameters. It's how `@Body()`,
`@Param()`, `@Query()` work under the hood.

### How to create @CurrentUser()

```typescript
// src/common/decorators/current-user.decorator.ts
import { User } from '@/generated/prisma/client';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type UserRequest = Omit<User, 'password'>;

export const CurrentUser = createParamDecorator(
  (data: keyof UserRequest | undefined, ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ user?: UserRequest }>();

    return data ? req.user?.[data] : req.user;
  },
);
```

### Breaking it down

| Part | What it does |
|------|-------------|
| `createParamDecorator(factory)` | Creates a decorator from a factory function |
| `data` | The argument passed to the decorator — e.g., `@CurrentUser('email')` passes `'email'` |
| `ctx.switchToHttp().getRequest()` | Gets the Express request object |
| `getRequest<T>()` | Generic type parameter — shapes `req` without relying on Express types |
| Return value | What gets injected into the controller parameter |

### Usage variations

```typescript
// Full user object
@CurrentUser() user: UserRequest

// Single field
@CurrentUser('id') userId: string

// With optional fallback
@CurrentUser('email') email?: string
```

### Why export the type?

```typescript
export type UserRequest = Omit<User, 'password'>;
```

Controllers import this type to annotate the parameter:

```typescript
import { CurrentUser, UserRequest } from '@/common/decorators/current-user.decorator';

@Get('profile')
async profile(@CurrentUser() user: UserRequest) {
  return user;
}
```

---

## Express Request Typing — Two Approaches

When typing `req.user`, there are two strategies:

### Approach A: Inline generic

```typescript
ctx.switchToHttp().getRequest<{ user?: UserRequest }>();
```

Scoped to just the decorator. Only `user` field is typed; `req.body`, `req.params`
are not available on this narrowed type. This is fine because the decorator
only accesses `req.user`.

### Approach B: Express type augmentation (global)

Create `src/types/express.d.ts`:

```typescript
declare global {
  namespace Express {
    interface Request {
      user?: UserRequest;
    }
  }
}
```

`req.user` is typed everywhere — works with `@Request()` in controllers too.

### This project uses BOTH

The decorator uses `getRequest<T>()` inline generic for the decorator's own
type safety. The `express.d.ts` augmentation ensures `req.user` is recognized
anywhere else `req` is used (future controllers, middleware, etc.). Both can
coexist — augmentation provides a global fallback, inline generic provides
precise scoped typing.

---

## Best Practices

- Use `createParamDecorator` for any request property you access frequently
  (user, tenant, locale, device info)
- Export the return type from the decorator file so controllers can import it
- Use `getRequest<T>()` inline generic for simple decorators — no extra files
- Pass the `data` parameter to allow extracting single fields
- Handle `undefined` gracefully with optional chaining (`?.`)

## Pitfalls

- Forgetting to export the type — controllers end up typing as `any` or
  defining their own type
- Creating `type UserRequest = { user: ... }` instead of the actual user
  shape — results in `user.user?.id` in controllers
- Assuming `req.user` exists when `@Public()` is used — it will be undefined
  because JWT auth is skipped

## Key Points

- `createParamDecorator` extracts request values for controller parameters
- `getRequest<T>()` inline generic types `req.user` inside the decorator
- `express.d.ts` global augmentation types `req.user` everywhere else
- Both approaches can coexist — augmentation is the fallback, inline is precise
- `data` parameter lets the decorator extract specific fields
- Export the type alongside the decorator for use in controllers
