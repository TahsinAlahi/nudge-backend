# Validation & DTOs

## What is a DTO?

A **DTO** (Data Transfer Object) defines the shape of data sent over the wire.
In NestJS, DTOs are plain classes decorated with `class-validator` and
`class-transformer` decorators for automatic validation and transformation.

---

## Why Classes, Not Interfaces?

```typescript
// ❌ Interface — decorators don't work
interface LoginDto {
  email: string;
  password: string;
}

// ✅ Class — decorators work at runtime
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
```

**Key point:** TypeScript interfaces are compile-time only. Decorators need
runtime metadata, which only classes provide.

---

## The `!` (Definite Assignment Assertion)

```typescript
email!: string;
```

The `!` tells TypeScript: "I know this property will be set at runtime, even
though it's not assigned in the constructor." This is required because
`class-transformer` sets properties *after* the object is created.

Without `!`, TypeScript throws:
```
Property 'email' has no initializer and is not definitely assigned in the constructor.
```

---

## The Global ValidationPipe

Configured in `src/main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,           // strip properties not in DTO
    transform: true,           // auto-transform types (string "1" → number 1)
    forbidNonWhitelisted: true,// throw error if extra properties sent
  })
);
```

### What Each Option Does

| Option | Effect |
|--------|--------|
| `whitelist: true` | Strips any property from the request that doesn't have a decorator in the DTO |
| `transform: true` | Converts plain JSON to class instances; also transforms types (e.g. `"123"` → `123`) |
| `forbidNonWhitelisted: true` | Instead of silently stripping, throws a `BadRequestException` |

**Example:**

```typescript
// POST /auth/login  body: { email: "test@test.com", password: "123456", extraField: "hack" }
// With whitelist + forbidNonWhitelisted → 400 error: "property extraField should not exist"
```

---

## Available Validators (class-validator)

```typescript
import {
  IsString, IsEmail, IsNumber, IsBoolean, IsOptional,
  IsDate, IsArray, IsEnum, IsUUID,
  MinLength, MaxLength, Min, Max,
  Matches, ArrayMinSize, ArrayMaxSize,
} from 'class-validator';
```

---

## Key Points to Remember

- **DTOs are classes** — never interfaces
- **Use `!`** — definite assignment assertion on all DTO fields
- **Whitelist is a security feature** — prevents mass assignment attacks
- **Transform enables class instances** — `body instanceof LoginDto` is true
- **`forbidNonWhitelisted`** — strict mode, fails on unknown properties
- **DTO file pattern** — `*.dto.ts` in ESLint config exempts DTOs from
  `no-unsafe-call` rule

---

## References

- [class-validator docs](https://github.com/typestack/class-validator)
- [class-transformer docs](https://github.com/typestack/class-transformer)
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
