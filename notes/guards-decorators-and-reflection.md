# Global Guards and the @Public() Pattern

## Why did we need this?

We wanted to protect most routes with JWT auth but leave a few open
(register, login, health). Instead of adding `@UseGuards(JwtAuthGuard)` on
every protected route, we made the guard **global** and created a `@Public()`
decorator to opt-out specific routes.

---

## Global Guards — APP_GUARD

### The problem

Without a global guard, you must remember to add `@UseGuards(JwtAuthGuard)` on
every single protected route. Miss one, and that route is open.

### The solution

NestJS provides a special provider token `APP_GUARD` that applies a guard to
every route in the application:

```typescript
// app.module.ts
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
```

Now `JwtAuthGuard` runs on **every** route before the controller handler. No
need for `@UseGuards()` on individual routes.

### The problem with global guards

Everything is now protected. Routes that should be public (register, login,
health) require a JWT token. We need a way to **opt-out** specific routes.

### Other global providers

| Token | Purpose |
|-------|---------|
| `APP_GUARD` | Runs on every route |
| `APP_PIPE` | Global validation/transformation pipe |
| `APP_INTERCEPTOR` | Global interceptor |
| `APP_FILTER` | Global exception filter |

---

## The Reflector — Reading Metadata

### What is it?

`Reflector` is a helper from `@nestjs/core` that reads metadata attached to
route handlers or controllers by decorators. It wraps JavaScript's
`Reflect.getMetadata`.

```typescript
import { Reflector } from '@nestjs/core';
```

### Why we need it

A guard only knows it's running — it doesn't know which route triggered it.
Metadata decorators let you **tag** routes with information, and `Reflector`
lets the guard read those tags.

### How it works

```
1. @Public() → sets metadata 'isPublic' = true on the handler
2. JwtAuthGuard runs → reflector.get('isPublic', handler)
3. If true → skip JWT validation
4. If false → run normal JWT auth
```

### NestJS Reflector methods

| Method | What it does |
|--------|-------------|
| `get(key, target)` | Reads metadata from a single target (handler or class) |
| `getAllAndOverride(key, [handler, class])` | Handler takes priority; falls back to class |
| `getAllAndMerge(key, [handler, class])` | Merges metadata from handler + class |

`getAllAndOverride` is the most useful for guards — you can set a default on
the controller class and override on specific routes.

### Example

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true; // skip auth
    return super.canActivate(context); // run JWT auth
  }
}
```

---

## @Public() Decorator — Marking Routes

### How to create it

```typescript
// src/common/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const Public = () => SetMetadata('isPublic', true);
```

`SetMetadata` is NestJS's wrapper around `Reflect.defineMetadata`. It attaches
`'isPublic' = true` to the decorated handler.

### How to use it

```typescript
@Public()
@Post('register')
async register(@Body() dto: RegisterDto) {
  return this.authService.register(dto);
}

@Public()
@Post('login')
async login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}
```

Routes without `@Public()` are automatically protected by the global guard.

### Class-level vs handler-level

```typescript
// Apply to every route in the controller
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {}

  @Get('details')
  @Public(false)
  details() {}
}
```

The `getAllAndOverride` pattern supports this — handler metadata overrides
class metadata.

---

## Best Practices

- Use `APP_GUARD` for guards that should protect every route by default
- Combine with `@Public()` to opt-out specific routes instead of opting-in
  every protected route with `@UseGuards()`
- Use `getAllAndOverride` in guards to support class-level defaults with
  handler-level overrides
- Wrap `SetMetadata` in a named decorator (`@Public()`) instead of using
  `@SetMetadata('isPublic', true)` directly everywhere

## Pitfalls

- Adding `@Public()` to a route that accesses `req.user` — `req.user` will be
  `undefined` because JWT auth is skipped, causing a TypeError
- Forgetting to import the module that provides the global guard — the guard
  can't resolve its dependencies

## Key Points

- `APP_GUARD` makes a guard apply to every route — no `@UseGuards()` needed
- `Reflector` reads metadata attached by custom decorators
- `@Public()` uses `SetMetadata('isPublic', true)` — the guard reads it and
  skips auth
- `getAllAndOverride` checks handler first, then class — useful for defaults
  with overrides
