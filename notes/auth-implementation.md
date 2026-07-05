# Auth Module Implementation — Practical Guide

## What we built

A JWT-based auth system in our NestJS app covering register, login, user
validation, and route protection. This note documents the practical decisions,
gotchas, and patterns we used.

---

## Passport.js — Why and How

### Why Passport instead of a custom guard?

Passport separates **how you authenticate** (strategy) from **what you protect**
(guard). The tradeoff:

| Approach | Lines of code | Files | Scales to multi-strategy? |
|----------|--------------|-------|--------------------------|
| Custom guard (inline JWT verify) | ~30 | 2 | ❌ Rewrite the guard |
| Passport JWT strategy + guard | ~80 | 4 | ✅ Add a new strategy file |

You pay ~50 lines for a standard pattern. If you later add Google OAuth or
magic-link auth, you write one new strategy — the guard stays the same.

### The Passport JWT flow

```
Request with Authorization: Bearer <token>
          │
          ▼
  ┌──────────────────┐
  │ JwtAuthGuard      │  extends AuthGuard('jwt')
  │ (guard)           │  Tells NestJS to run the 'jwt' strategy
  └──────┬───────────┘
         │
         ▼
  ┌──────────────────┐
  │ JwtStrategy       │  extends PassportStrategy(Strategy)
  │                   │
  │ 1. Extract token  │  ExtractJwt.fromAuthHeaderAsBearerToken()
  │ 2. Verify JWT     │  jwt.verify(token, secretOrKey)
  │ 3. Call validate()│  Your code: fetch user from DB, check soft-delete
  │ 4. Return user    │  Attached to req.user
  └──────┬───────────┘
         │
         ▼
  req.user = { id, email, name, avatar }
```

### Three pieces that must exist

| Piece | File | Purpose |
|-------|------|---------|
| Strategy | `jwt.strategy.ts` | Extracts + verifies token, validates user |
| Guard | `jwt-auth.guard.ts` | `@UseGuards(JwtAuthGuard)` on routes |
| Module wiring | `auth.module.ts` | Registers PassportModule, JwtModule, strategy, guard |

### Wiring in auth.module.ts

```typescript
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({ ... }),
  ],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [JwtStrategy, JwtAuthGuard, PassportModule],
})
```

**Why export them?** So other modules (AccountModule, TransactionModule) can
use `@UseGuards(JwtAuthGuard)` without re-importing AuthModule. They import
AuthModule once and get the guard.

---

## Factory Pattern — register vs registerAsync

### The problem

```typescript
// ❌ Static config — config evaluated at module load time
JwtModule.register({
  secret: process.env.JWT_SECRET,  // works, but no validation
})

// ❌ This doesn't work either — ConfigService doesn't exist yet
JwtModule.register({
  secret: configService.get('jwt.secret'),  // configService is undefined!
})
```

When NestJS processes module imports, the DI container isn't built yet.
`ConfigService` doesn't exist at that point.

### The factory solution

```typescript
// ✅ Factory — runs AFTER the DI container is built
JwtModule.registerAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    secret: configService.get('jwt.secret'),
    signOptions: { expiresIn: '6h' },
  }),
})
```

`registerAsync` tells NestJS: "Don't evaluate this now. Wait until the DI
container is ready, then call the factory function with the injected services."

### When to use each

| Method | Use when | Example |
|--------|----------|---------|
| `register()` | Config comes from hardcoded values or `process.env` | `secret: 'my-hardcoded-secret'` |
| `registerAsync()` | Config comes from a NestJS service (ConfigService, etc.) | `secret: configService.get('jwt.secret')` |

**Both work for env vars.** If you're happy reading `process.env.JWT_SECRET`
directly, `register()` is simpler. If you want the fail-fast benefit of
ConfigService + Joi validation, use `registerAsync()`.

### The tradeoff

```
register():            simpler, 1 line
registerAsync():       safer (validated at startup), 6 lines with factory
```

Both produce the exact same JwtModule at runtime.

---

## JWT Payload Conventions

### What goes in the token

```typescript
// ❌ Non-standard payload
const payload = { id: user.id, email: user.email };
return this.jwtService.sign(payload);

// ✅ Standard JWT payload (sub = subject = user identifier)
const payload = { sub: user.id, email: user.email };
return this.jwtService.sign(payload);
```

`sub` is the standard JWT claim for the user identifier. It's what Passport's
JWT strategy and most auth middleware expect. If you use `id` instead,
downstream code needs to know your non-standard convention.

### What the strategy receives

```typescript
// JwtStrategy.validate() receives what you put in the token
async validate(payload: { sub: string; email: string }) {
  // payload.sub  → user.id
  // payload.email → user.email
}
```

### What gets attached to `req.user`

```typescript
// Whatever you return from validate() becomes req.user
async validate(payload: { sub: string; email: string }) {
  const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, ... });

  return { id: user.id, email: user.email, name: user.name };
  // → req.user = { id, email, name }
}
```

---

## Prisma select — The Password Leak Pitfall

### What doesn't work

```typescript
// ❌ Prisma doesn't support "exclude this field" syntax
prisma.user.create({
  data: { ... },
  select: { password: false },  // ignored!
})                              // returns everything including password
```

### What works

```typescript
// ✅ Explicitly list the fields you want
prisma.user.create({
  data: { ... },
  select: { id: true, email: true, name: true, avatar: true, createdAt: true },
})
```

### Stripping password from an existing object

```typescript
// When you already fetched the user (e.g., for validation)
const user = await prisma.user.findUnique({ where: { email } });
// user has: { id, name, email, password, avatar, ... }

// Use destructuring to strip it
const { password, ...userWithoutPassword } = user;
// userWithoutPassword has everything except password
```

This is useful when `validateUser()` needs the password internally but callers
shouldn't get it.

### Extracting it as a reusable helper

```typescript
// auth.service.ts
private removePasswordFromUser(user: User): Omit<User, 'password'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...result } = user;
  return result;
}
```

Now any method that needs to strip the password can call this instead of
repeating the destructure. Both `validateUser()` and `checkValidityOfUser()`
use it. If you later add more sensitive fields (e.g., `refreshToken`), you
only change one place.

---

## Error Message Hygiene

### Don't leak which field is wrong

```typescript
// ❌ Too informative — tells attacker which field failed
throw new HttpException('Invalid Email Address', UNAUTHORIZED);
throw new HttpException('Invalid Password', UNAUTHORIZED);

// ✅ Vague — attacker can't tell if email exists or password is wrong
throw new HttpException('Invalid credentials', UNAUTHORIZED);
```

**Why it matters:** If you say "Invalid Password" vs "Invalid Email", an
attacker can enumerate valid emails. They try a list of emails — if they get
"Invalid Password", they know the email exists.

### Match status code to message

```typescript
// ❌ Contradictory — 409 means "conflict" (resource exists), not "bad input"
throw new HttpException('Invalid Credentials', HttpStatus.CONFLICT);

// ✅ Consistent
throw new HttpException('Email already registered', HttpStatus.CONFLICT);
throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
```

---

## Register should return a token

```typescript
// ❌ Client has to make a second request
async register(dto: RegisterDto) {
  const user = await prisma.user.create({ ... });
  return user;  // no token
}

// ✅ Client is logged in immediately
async register(dto: RegisterDto) {
  const user = await prisma.user.create({ ... });
  const token = this.jwtService.sign({ sub: user.id, email: user.email });
  return { user, accessToken: token };
}
```

The user just created an account — they should be authenticated right away.
Making them call login separately is unnecessary friction.

---

## Complete Auth Pipeline — Trace

```typescript
// POST /v1/auth/login
// Body: { "email": "user@test.com", "password": "secret123" }

// 1. GlobalValidationPipe (main.ts)
//    - class-transformer: plain obj → LoginDto instance
//    - @IsEmail() check → "user@test.com" ✓
//    - @MinLength(6) check → "secret123" ✓

// 2. AuthController.login()
//    calls AuthService.login(dto)

// 3. AuthService.login()
//    calls this.validateUserData(email, password)
//    → Prisma: findUnique({ where: { email } })
//    → bcrypt.compare(password, user.password)
//    → returns user or null

// 4. AuthService.generateToken()
//    this.jwtService.sign({ sub: user.id, email: user.email })
//    returns access token as string

// 5. Response: { accessToken: "eyJhbG..." }
```

```typescript
// GET /v1/auth/profile
// Header: Authorization: Bearer eyJhbG...

// 1. JwtAuthGuard → AuthGuard('jwt') triggers JwtStrategy

// 2. JwtStrategy.validate({ sub, email })
//    → ExtractJwt.fromAuthHeaderAsBearerToken()
//    → jwt.verify(token, secret)
//    → prisma.user.findUnique({ where: { id: payload.sub } })
//    → check !user || user.isDeleted → UnauthorizedException
//    → return { id, email, name, avatar } → attaches to req.user

// 3. Controller receives req.user via @CurrentUser() decorator
```

---

## Best Practices

- Use `registerAsync()` when config depends on a NestJS service
- Use `sub` in JWT payloads — it's the JWT standard
- Always use `select` in Prisma to explicitly include fields — never try to exclude
- Return generic error messages ("Invalid credentials") — don't help attackers
- Return tokens on register — don't force a second login call
- Validate user existence and soft-delete status in JwtStrategy
- Export strategy + guard from your auth module so other modules can use them
- Soft-reset (`git reset --soft HEAD~1`) to fix commit messages instead of amending

## Pitfalls

- `select: { password: false }` does NOT work in Prisma — you must list what you want
- `payload.username` was undefined because we signed with `{ sub, email }`, not `{ username }`
- Forgetting `PassportModule` in imports → `AuthGuard('jwt')` doesn't resolve
- Not registering `JwtStrategy` in providers → strategy never runs
- `envValidationSchema` must match the shape of `process.env` (flat keys), not the config object (nested keys)
- `HttpStatus.CONFLICT` with message "Invalid credentials" is contradictory — status says "exists," message says "wrong"

## Key Points

- Passport = strategy + guard pattern; strategy verifies, guard protects
- Factory config (`registerAsync`) delays evaluation until DI is ready
- JWT standard: `sub` for user ID, not `id`
- Prisma `select` is inclusion-only, not exclusion
- Error messages should be vague for auth (don't leak which field failed)
- Register endpoint should return `{ user, accessToken }`
- JwtStrategy should verify the user exists and isn't deleted
- `git reset --soft HEAD~1` undoes the commit but keeps changes staged
