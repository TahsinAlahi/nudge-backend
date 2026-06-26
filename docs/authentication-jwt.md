# Authentication & JWT

## What is JWT?

**JWT** (JSON Web Token) is a compact, URL-safe token format for transferring
claims between parties. It consists of three parts: **header**, **payload**,
and **signature**.

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U
```

---

## Auth Module Structure

Our auth module lives at `src/modules/auth/`:

```
src/modules/auth/
  └─ dto/
       └─ login.dto.ts
```

### Login DTO (`src/modules/auth/dto/login.dto.ts`)

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
```

**Key points:**
- `!` — definite assignment assertion (TypeScript), tells TS the property will
  be set (by class-validator/class-transformer at runtime)
- DTOs are plain classes, not interfaces — required for `class-validator` to
  work with decorators
- Validation runs automatically via the global `ValidationPipe`

---

## Typical JWT Auth Flow

```
1. POST /auth/login  →  email + password
2. Server validates credentials, generates JWT
3. Returns { accessToken, refreshToken }
4. Client sends accessToken in Authorization: Bearer <token>
5. Server validates token on every protected route via a Guard
6. When accessToken expires, client sends refreshToken to get a new pair
```

### Tokens Used

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| **Access Token** | Short (15 min) | Memory / HTTP-only cookie | Authenticates API requests |
| **Refresh Token** | Long (7 days) | HTTP-only cookie / DB | Issues new access tokens |

---

## JWT Configuration

Env variables defined in `.env`:

```
JWT_SECRET=your-super-secret-change-me
JWT_REFRESH_SECRET=another-secret-change-me
```

Loaded via `src/config/configuration.ts`:

```typescript
export default () => ({
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
  },
});
```

Validated with Joi in `src/config/envValidationSchema.ts`:

```typescript
jwt: Joi.object({
  secret: Joi.string().required(),
  refreshSecret: Joi.string().required(),
}),
```

---

## Key Points to Remember

- **Two secrets** — one for access tokens, one for refresh tokens (defense in
  depth; if access secret is compromised, refresh tokens can still be rotated)
- **DTOs are classes** — never interfaces (decorators don't work on interfaces)
- **`!` in DTOs** — required because the property is set after construction,
  not in the constructor
- **class-validator** — `@IsEmail()`, `@IsString()`, `@MinLength(6)` are
  decorators that run at runtime via ValidationPipe
- **Password storage** — always hash with bcrypt (or argon2), never store
  plaintext
- **Guard pattern** — NestJS `@Guard()` decorator to protect routes; an
  `AuthGuard('jwt')` is the standard way

---

## References

- [JWT.io](https://jwt.io/) — debugger
- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [NestJS Guards](https://docs.nestjs.com/guards)
