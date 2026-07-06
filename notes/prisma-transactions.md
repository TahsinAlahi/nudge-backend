# Prisma Database Transactions

## Why did we need this?

The `register` endpoint had a race condition:

```typescript
// Step 1: check if email exists (separate query)
const doesUserExist = await this.prisma.user.findUnique({ where: { email } });
if (doesUserExist) throw error;

// Step 2: create user (separate query)
const user = await this.prisma.user.create({ data: { ... } });

// Step 3: create refresh token (separate query)
await this.prisma.refreshToken.create({ data: { ... } });
```

Two problems:
1. **Race condition** — another request with the same email could sneak in between Step 1 and Step 2. Both pass the check, then one hits the DB unique constraint — a raw 500 error instead of our clean 409.
2. **Orphaned data** — if Step 2 succeeds but Step 3 fails (network blip, DB restart), the user is created with no refresh token. They have to log in again even though they just registered.

Database transactions solve both problems.

## How does it work?

### The concept

A database transaction groups multiple operations into a single **atomic unit**: all succeed, or none do. If any step fails, the database rolls everything back as if it never happened.

```sql
BEGIN;                    -- start transaction
INSERT INTO users ...;    -- step 1
INSERT INTO refresh_tokens ...;  -- step 2
COMMIT;                   -- all good, save everything
-- or
ROLLBACK;                 -- something failed, undo everything
```

### In Prisma

Prisma offers two transaction modes:

**1. Interactive transactions** (what we use):

```typescript
await this.prisma.$transaction(async (tx) => {
  // All reads and writes use `tx` instead of `this.prisma`
  const user = await tx.user.create({ data: { ... } });
  await tx.refreshToken.create({ data: { ... } });
  return user;
});
```

The `tx` object is a transaction-level Prisma client. Any query called on `tx` runs within the transaction. If the callback throws, Prisma calls `ROLLBACK`. If it succeeds, Prisma calls `COMMIT`.

**2. Batch transactions** (for independent operations):

```typescript
await this.prisma.$transaction([
  this.prisma.user.update(...),
  this.prisma.refreshToken.deleteMany(...),
]);
```

Useful when you have multiple independent writes that should be atomic.

### Does throwing inside the callback work?

Yes. Prisma catches any error from the callback, rolls back the transaction, and re-throws the error. So `throw new HttpException(...)` inside a transaction works normally — NestJS's exception filter handles it as usual.

## Project Example

### Before — race condition & orphan risk

```typescript
async register(dto: RegisterDto) {
  const doesUserExist = await this.prisma.user.findUnique({ where: { email: dto.email } });
  if (doesUserExist) throw new HttpException('Email is already in use', HttpStatus.CONFLICT);

  const user = await this.prisma.user.create({ data: { ... } });

  const payload: JwtPayload = { sub: user.id, email: user.email };
  return {
    user,
    accessToken: this.generateToken(payload),
    refreshToken: await this.generateRefreshToken(payload), // could fail!
  };
}
```

### After — wrapped in transaction

```typescript
async register(dto: RegisterDto) {
  const saltRounds = 10;
  const encryptedPassword = await bcrypt.hash(dto.password, saltRounds);

  const result = await this.prisma.$transaction(async (tx) => {
    const doesUserExist = await tx.user.findUnique({ where: { email: dto.email } });
    if (doesUserExist) {
      throw new HttpException('Email is already in use', HttpStatus.CONFLICT);
    }

    const user = await tx.user.create({ data: { ... } });

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = this.generateToken(payload);

    const token = crypto.randomBytes(40).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    await tx.refreshToken.create({
      data: {
        token: hashedToken,
        userId: payload.sub,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { user, accessToken, refreshToken: token };
  });

  return result;
}
```

### Token rotation in refreshAccessToken

```typescript
async refreshAccessToken(refreshToken: string) {
  const sessionToken = await this.prisma.refreshToken.findFirst({
    where: { token: hashedRefreshToken, expiresAt: { gt: new Date() } },
  });
  if (!sessionToken) throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);

  const user = await this.prisma.user.findUnique({
    where: { id: sessionToken.userId, isDeleted: false },
  });
  if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

  const payload: JwtPayload = { sub: user.id, email: user.email };
  const accessToken = this.generateToken(payload);

  const newToken = crypto.randomBytes(40).toString('hex');
  const hashedNewToken = crypto.createHash('sha256').update(newToken).digest('hex');

  await this.prisma.$transaction(async (tx) => {
    await tx.refreshToken.delete({ where: { id: sessionToken.id } });  // revoke old
    await tx.refreshToken.create({ data: { ... } });                    // issue new
  });

  return { accessToken, refreshToken: newToken };
}
```

Without the transaction, a crash between `delete` and `create` would permanently destroy the user's session.

## Best Practices

- **Keep transactions short** — do expensive work (bcrypt hashing, external API calls) *before* opening the transaction. Prisma holds DB locks until COMMIT/ROLLBACK.
- **Use `tx` for all DB calls** inside the callback — never mix `this.prisma` and `tx` in the same transaction. Using `this.prisma` bypasses the transaction context.
- **Throw normally** — NestJS `HttpException` inside a transaction works correctly. Prisma rolls back and re-throws, your exception filter catches it.
- **Interactive for complex flows** — use callback-based `$transaction(async (tx) => { ... })` when operations depend on each other (check-then-create).
- **Batch for independent writes** — use `$transaction([...])` when you have multiple writes that don't depend on each other.

## Tradeoffs

| Approach | Pros | Cons |
|----------|------|------|
| No transaction | Simple code, no overhead | Race conditions, orphaned data |
| Interactive transaction (callback) | Atomic, can read-then-write, error handling is clean | Slightly more verbose, longer lock duration |
| Batch transaction (array) | Concise for parallel writes | Can't do conditional logic between operations |

## Pitfalls

- **Don't put slow I/O inside the transaction** — bcrypt, network calls, file uploads. They hold DB locks for no reason. Hash the password before opening the transaction.
- **Prisma's `findUnique` inside a transaction does NOT lock the row by default** — it's a regular SELECT. For strict race prevention on inserts, the unique constraint is your real safety net. The transaction prevents the gap between check and insert.
- **Nested transactions are not supported** — Prisma will throw. If you call `$transaction` inside another `$transaction`, you get an error.
- **Interactive transactions require the Prisma server (not just the client)** — they use SQL `BEGIN`/`COMMIT` under the hood. Ensure your Prisma engine connects to a database that supports transactions (PostgreSQL does).

## Key Points

- A transaction makes multiple operations atomic: all succeed or all roll back
- Race conditions happen between separate queries — a transaction closes that gap
- Orphaned data is prevented when the last operation in a sequence fails
- Do expensive work (hashing, API calls) *outside* the transaction
- Prisma's interactive transactions use `$transaction(async (tx) => { ... })`
- Use `tx` (not `this.prisma`) for all DB calls inside the callback
- Exceptions thrown inside the callback roll back the transaction and propagate normally
