# Runtime vs Compile-time, Classes vs Interfaces, and the Validation Pipeline

## Why did we need this?

When building the auth module, three questions kept coming up:

1. **Why must DTOs be classes and not interfaces?** TypeScript has both, but
   only one works with `class-validator`.
2. **What does "runtime vs compile-time" actually mean?** These terms get thrown
   around, but the practical impact only hits you when decorators don't "just
   work."
3. **How does a request body become a validated DTO?** The `ValidationPipe` is
   declared in `main.ts` — but what happens step-by-step when a request arrives?

## Runtime vs Compile-time

### The mental model

| Layer | When | What happens | Who cares |
|-------|------|-------------|-----------|
| **Compile-time** | `npx nest build` (or `tsc`) | TypeScript checks types, removes type annotations, emits plain JS | You, the developer — catches bugs early |
| **Runtime** | `node dist/main` (server running) | The emitted JS executes, decorators fire, validation runs | The running server — determines if requests succeed or fail |

### The critical insight

**TypeScript types vanish at runtime.** There is no TypeScript runtime. The
compiler strips interfaces, type aliases, and type annotations entirely.

```typescript
// This exists ONLY at compile-time
interface UserDto {
  email: string;
  password: string;
}

// After compilation → nothing. Empty. Gone.
// The JS file has zero traces of UserDto.
```

```typescript
// This survives to runtime
class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

// After compilation → a real class with decorator metadata
// class LoginDto { constructor() { ... } }
// Reflect.defineMetadata('design:type', ...)
```

### Why decorators need classes

Decorators (`@IsEmail()`, `@Injectable()`) are functions that execute at
**runtime**. They attach metadata using `Reflect.defineMetadata`. That metadata
is read later by:

- `ValidationPipe` — reads `class-validator` metadata to know what to validate
- `NestJS DI container` — reads `@Injectable()` to register the provider
- `class-transformer` — reads `@Type()` etc. to know how to transform nested
  objects

If the thing you're decorating doesn't exist at runtime (like an interface),
there's nothing to attach metadata to, and nothing to read later.

**Summary:** TypeScript is a compile-time-only type system. Decorators are a
JavaScript (and soon TC39 standard) runtime feature. They need real,
runtime-visible constructs — classes, not interfaces.

## Classes vs Interfaces in TypeScript

### What each is

```typescript
// Interface — pure compile-time construct
// Describes a shape. Completely erased during compilation.
interface UserResponse {
  id: string;
  name: string;
  email: string;
}

// Class — runtime construct + compile-time type
// Compiles to a constructor function + prototype.
class LoginDto {
  @IsEmail()
  email!: string;

  @MinLength(6)
  password!: string;
}
```

### Key differences

| Aspect | Interface | Class |
|--------|-----------|-------|
| Runtime existence | ❌ Erased entirely | ✅ Compiles to a function |
| Can have decorators | ❌ No | ✅ Yes |
| Can have methods | ❌ No (only signatures) | ✅ Yes |
| Can be instantiated | ❌ `new UserResponse()` → error | ✅ `new LoginDto()` works |
| Can use `instanceof` | ❌ Not possible | ✅ `dto instanceof LoginDto` |
| Performance cost | ✅ Zero | ❌ Minimal (constructor call) |
| Use case | Describing shapes, DTO types | DTO validation, DI, runtime behavior |
| Can extend another class | ❌ No | ✅ Yes |
| Can implement an interface | N/A | ✅ Yes |

### When to use which in this project

- **Class** — DTOs (RegisterDto, LoginDto), services (AuthService),
  controllers, guards, strategies, entities/models
- **Interface** — Prisma query results (generated types like `User`, `Account`),
  return types from methods, props interfaces

### The annoying `!` in DTOs explained

```typescript
class RegisterDto {
  @IsEmail()
  email!: string;  // ← what's this `!` ?
}
```

Without `!`, TypeScript warns: "Property 'email' has no initializer and is not
definitely assigned in the constructor." This is because:

1. `strictNullChecks` is on in `tsconfig.json`
2. The properties are set by `class-transformer` at runtime, not in a
   constructor
3. TypeScript can't know they'll be set later

The `!` (definite assignment assertion) tells TypeScript: "Trust me, it'll be
set before anyone uses it." It's a compile-time-only thing — has zero runtime
effect.

## Validation Pipeline in NestJS

### The big picture

```
HTTP Request
     │
     ▼
┌─────────────────────┐
│  GlobalMiddleware    │  (cors, helmet, etc.)
├─────────────────────┤
│  Versioning         │  (/v1/ prefix stripping)
├─────────────────────┤
│  GlobalException    │  (catches errors thrown downstream)
│  Filter             │
├─────────────────────┤
│  GlobalValidation   │  ←── WE ARE HERE
│  Pipe               │
├─────────────────────┤
│  Guard              │  (authentication: JwtAuthGuard)
├─────────────────────┤
│  Interceptor        │  (logging, transformation, etc.)
├─────────────────────┤
│  Route Handler      │  (controller method)
└─────────────────────┘
```

### What ValidationPipe does, step by step

When a POST request hits `POST /v1/auth/register` with body
`{"email": "bad", "password": "12"}`:

**Step 1: Parse body**

Express parses the raw JSON into a plain JavaScript object:
```javascript
{ email: 'bad', password: '12' }
```

**Step 2: Transform (class-transformer)**

The `ValidationPipe` (with `transform: true` in our config) converts the plain
object into an instance of the DTO class:

```typescript
const dto = new RegisterDto();
dto.email = 'bad';
dto.password = '12';
```

This is what `transform: true` does. Without it, you'd get the plain object
instead of a class instance. `transform: true` is essential because:
- Decorators like `@IsEmail()` are on the class prototype — they only work on
  class instances
- Without transformation, the object has no metadata attached

**Step 3: Validate (class-validator)**

The pipe reads the registered decorators and runs each validator:

- `@IsEmail()` → checks `dto.email` → `'bad'` is not a valid email → **fail**
- `@MinLength(6)` on password → `'12'` is only 2 chars → **fail**

**Step 4: Strip unknown properties (`whitelist: true`)**

If someone sends extra properties (e.g., `{"email":"a@b.com",
"password":"123456", "isAdmin": true}`), `whitelist: true` strips `isAdmin`
from the DTO. The route handler never sees it.

**Step 5: Reject unknown properties (`forbidNonWhitelisted: true`)**

With `forbidNonWhitelisted: true` enabled, instead of silently stripping, the
pipe throws a `BadRequestException` saying "property isAdmin should not exist."

**Step 6: Return result or throw error**

If validation passes → the validated class instance moves to the route handler.

If validation fails → NestJS throws a `BadRequestException` with an array of
validation errors:

```json
{
  "statusCode": 400,
  "message": [
    "email must be an email",
    "password must be longer than or equal to 6 characters"
  ],
  "error": "Bad Request"
}
```

The `GlobalExceptionFilter` catches this and formats it into our standard
response shape.

### The three ValidationPipe options and why each matters

| Option | What it does | Why we use it |
|--------|-------------|---------------|
| `whitelist: true` | Strips properties without decorators | Security — prevents mass assignment attacks |
| `transform: true` | Converts plain objects to class instances | Required for decorators to work |
| `forbidNonWhitelisted: true` | Throws error instead of silently stripping | Strictness — catches typos early |

### What validation looks like in our project

- The pipe is configured once in `main.ts` (global)
- Each DTO class declares what to validate via decorators
- Controllers simply type-hint the parameter: `@Body() dto: RegisterDto`
- The pipe handles everything automatically

No manual validation in controllers. No try-catch for validation errors. One
configuration point, declarative DTOs, automatic error responses.

### Why validation works without importing anything in feature modules

The `ValidationPipe` in `main.ts` is registered as a **global pipe** via
`app.useGlobalPipes(...)`. This is different from module-level providers —
global pipes apply to every route in every module without any imports.

This is why DTOs in a new `AuthModule` are validated even though the module
doesn't mention `ValidationPipe` anywhere. The global registration in
`main.ts` covers all controllers.

## Project Example

### The full flow for `POST /v1/auth/register`

```typescript
// 1. Request body arrives: { "name": "T", "email": "bad", "password": "1" }

// 2. GlobalValidationPipe runs (configured in main.ts)
//    a. class-transformer: { name: "T", ... } → new RegisterDto()
//    b. @IsString() on name → "T" is a string ✅
//    c. @MinLength(2) on name → "T" is only 1 char ❌
//    d. @IsEmail() on email → "bad" is not email ❌
//    e. @IsString() + @MinLength(6) on password → "1" too short ❌

// 3. Pipe throws BadRequestException with all errors
//    (thanks to class-validator collecting all errors, not stopping at first)

// 4. GlobalExceptionFilter catches it, returns:
//    {
//      statusCode: 400,
//      timestamp: "2026-07-02T...",
//      path: "/v1/auth/register",
//      message: {
//        statusCode: 400,
//        message: [
//          "name must be longer than or equal to 2 characters",
//          "email must be an email",
//          "password must be longer than or equal to 6 characters"
//        ],
//        error: "Bad Request"
//      }
//    }
```

## URI Versioning — The thing that tripped us up

### What we learned

When you call `app.enableVersioning({ type: VersioningType.URI,
defaultVersion: '1' })` in `main.ts`, NestJS automatically prefixes **all
routes** with `/v1/`.

```typescript
@Controller('health')
// Without versioning → /health
// With URI versioning → /v1/health
```

### How the code maps

| Controller | Without versioning | With versioning |
|-----------|-------------------|-----------------|
| `@Controller('health')` | `GET /health` | `GET /v1/health` |
| `@Controller({ path: 'auth', version: '1' })` | `POST /auth/register` | `POST /v1/auth/register` |
| `@Controller()` (root) | `GET /` | `GET /v1/` |

### Ways to customize

```typescript
// Option A: Let the controller version be explicit
@Controller({ path: 'health', version: '1' })
export class HealthController {}

// Option B: Exclude from versioning entirely
@Controller({ path: 'health', version: VERSION_NEUTRAL })  // stays at /health

// Option C: Multiple versions
@Controller({ path: 'users', version: ['1', '2'] })  // /v1/users AND /v2/users
```

### Why this matters for our health endpoint

`GET /health` returns 404 because NestJS expects `GET /v1/health`. The
`VersioningType.URI` changes the effective route, and the framework doesn't
fall back to non-versioned routes by default.

## Best Practices

- Always use **classes for DTOs** — interfaces are erased, decorators need
  runtime constructs
- Enable **`transform: true`** on `ValidationPipe` — otherwise class-validator
  decorators don't fire because the object isn't a class instance
- Use **`whitelist: true`** — prevents clients from sending unexpected fields
  that might sneak through
- Configure validation **once globally** in `main.ts`, not per-controller
  or per-route
- Use **`!` in DTOs** when properties are set after construction by
  class-transformer (prevents TS strictNullChecks errors)
- Remember URI versioning **changes all your routes** — you can confirm by
  checking the NestJS startup logs which show the registered routes

## Pitfalls

- Forgetting `transform: true` — the DTO is a plain object, decorators don't
  run, validation passes everything
- Expecting `/health` to work after enabling URI versioning — it becomes
  `/v1/health`
- Using an interface for a DTO and wondering why `@IsEmail()` has no effect
  (the interface was erased at compile-time, there's nothing to attach
  decorators to)
- Not using `!` in DTOs and getting confusing TS errors about uninitialized
  properties (even though the code works at runtime)
- Confusing `forbidNonWhitelisted: true` with `whitelist: true` — one strips,
  the other throws. Both are useful but for different strictness levels.

## Key Points

- **Compile-time** = TypeScript type checking (vanishes in JS output)
- **Runtime** = Decorators, DI, validation (executes in Node.js)
- **Classes survive compilation, interfaces do not** — always use classes when
  decorators are involved
- `!` is a compile-only assertion, has zero runtime effect
- `ValidationPipe` runs globally: transform → validate → whitelist → reject
- `transform: true` is required for class-validator decorators to fire
- URI versioning with `VersioningType.URI` prefixes `/v1/` to every route
- The pipe, filter, guards, and interceptors form a pipeline — order matters
