# Refresh Tokens

## Why did we need this?

Access tokens (JWTs) are short-lived by design — ours expire in 6 hours. This limits damage if one is leaked: an attacker can only use it for a few hours. But asking the user to re-enter their password every 6 hours is a terrible experience.

Refresh tokens solve this: a **long-lived token** (ours: 7 days) stored securely by the client. When the access token expires, the client silently exchanges the refresh token for a new access token via `POST /auth/refresh`. The user stays logged in without re-entering their password.

## How does it work?

### The flow

```
Client                          Server
  │                                │
  │  POST /auth/login              │
  │  { email, password }           │
  │                                │── validate credentials
  │                                │── generate access token (6h)
  │                                │── generate refresh token (random, stored in DB)
  │  ← { accessToken, refreshToken }
  │                                │
  │  [6 hours later]               │
  │  POST /auth/refresh            │
  │  { refreshToken }              │
  │                                │── hash the provided token
  │                                │── look up hash in DB
  │                                │── check not expired
  │                                │── DELETE old token (rotation)
  │                                │── CREATE new refresh token
  │                                │── generate new access token
  │  ← { accessToken, refreshToken }
  │                                │
  │  POST /auth/logout             │
  │  { refreshToken }              │
  │                                │── delete token from DB
```

### Opaque tokens vs JWT refresh tokens

There are two schools of thought:

**Opaque tokens** (what we chose):
- Generate a random string: `crypto.randomBytes(40).toString('hex')`
- Hash it with SHA-256 before storing in DB
- Return the raw token to the client
- On refresh, hash the provided token and look it up in DB
- The DB is the single source of truth — deleting a row instantly revokes it

**JWT refresh tokens**:
- Sign a JWT with a separate `refreshSecret`
- Can verify expiry without hitting the DB
- But can't be revoked without a blocklist (DB hit anyway)
- Stateless verification is nice, but revocation requires state

We chose opaque tokens because:
- Instant revocation (just delete the row)
- No JWT expiry confusion (DB `expiresAt` is the authority)
- If a user has multiple devices, each gets its own token — revoke per-device

### Token rotation

Every time `POST /auth/refresh` is called, we:
1. Delete the old refresh token from DB
2. Create a completely new refresh token
3. Return the new token alongside the new access token

This is **rotation**. The old token becomes invalid immediately. Benefits:
- If a refresh token is stolen, using it also invalidates the legitimate user's token — both parties notice something is wrong
- Limits the window of vulnerability for any single token

### Why hash before storing?

We store `SHA-256(token)` in the database, never the raw token.

```
Raw token:       a1b2c3d4e5f6... (40 random bytes = 80 hex chars)
Stored in DB:    SHA-256("a1b2c3d4e5f6...") = 6ca13d52ca70c8...
Returned to client: a1b2c3d4e5f6... (the raw token)
```

If the database is breached, the attacker gets hashes — they can't use them directly because SHA-256 is one-way. They'd have to brute-force 80 hex characters, which is computationally infeasible.

## Project Example

### The Prisma model

```prisma
model RefreshToken {
  id        String   @id @default(uuid(7))
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
}
```

Key points:
- `token` is unique — prevents duplicate entries
- `onDelete: Cascade` — deleting a user cleans up their tokens
- `expiresAt` indexed — cleanup queries are fast
- `userId` indexed — "revoke all sessions for this user" queries are fast

### Generating a refresh token

```typescript
private async generateRefreshToken(payload: JwtPayload) {
  const token = crypto.randomBytes(40).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  await this.prisma.refreshToken.create({
    data: {
      token: hashedToken,
      userId: payload.sub,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });
  return token; // return raw token to client
}
```

### Refreshing (with rotation + transaction)

```typescript
async refreshAccessToken(refreshToken: string) {
  const hashedRefreshToken = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  const sessionToken = await this.prisma.refreshToken.findFirst({
    where: { token: hashedRefreshToken, expiresAt: { gt: new Date() } },
  });

  if (!sessionToken) {
    throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);
  }

  const user = await this.prisma.user.findUnique({
    where: { id: sessionToken.userId, isDeleted: false },
  });

  if (!user) {
    throw new HttpException('User not found', HttpStatus.NOT_FOUND);
  }

  const payload: JwtPayload = { sub: user.id, email: user.email };
  const accessToken = this.generateToken(payload);

  const newToken = crypto.randomBytes(40).toString('hex');
  const hashedNewToken = crypto.createHash('sha256').update(newToken).digest('hex');

  // Atomic: delete old + create new
  await this.prisma.$transaction(async (tx) => {
    await tx.refreshToken.delete({ where: { id: sessionToken.id } });
    await tx.refreshToken.create({
      data: {
        token: hashedNewToken,
        userId: payload.sub,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  });

  return { accessToken, refreshToken: newToken };
}
```

### Logout (revoke specific token)

```typescript
async logout(refreshToken: string) {
  const hashedRefreshToken = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  await this.prisma.refreshToken.deleteMany({
    where: { token: hashedRefreshToken },
  });
  // deleteMany is idempotent — succeeds even if token doesn't exist
}
```

### Login returns both tokens

```typescript
async login(dto: LoginDto) {
  const user = await this.validateUserData(dto.email, dto.password);
  if (!user) {
    throw new HttpException('Invalid Credentials', HttpStatus.UNAUTHORIZED);
  }

  const payload: JwtPayload = { sub: user.id, email: user.email };
  return {
    accessToken: this.generateToken(payload),
    refreshToken: await this.generateRefreshToken(payload),
  };
}
```

### Register also returns tokens

```typescript
// Inside the transaction:
const user = await tx.user.create({ ... });
const payload: JwtPayload = { sub: user.id, email: user.email };

const token = crypto.randomBytes(40).toString('hex');
const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
await tx.refreshToken.create({ data: { token: hashedToken, userId: payload.sub, ... } });

return { user, accessToken: this.generateToken(payload), refreshToken: token };
```

This way the user doesn't need a separate login step after registration.

### Controller endpoints

```typescript
@Public()
@Post('login')
async login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}

@Public()
@Post('refresh')
async refresh(@Body() dto: RefreshDto) {
  return this.authService.refreshAccessToken(dto.refreshToken);
}

@Public()
@Post('logout')
async logout(@Body() dto: LogoutDto) {
  return this.authService.logout(dto.refreshToken);
}
```

All three are `@Public()` because:
- login/logout happen before the user has a valid access token
- refresh is called when the access token has already expired

## Best Practices

- **Always hash the token before storing** — SHA-256 is fast and makes a DB breach harmless
- **Rotate on every refresh** — delete old, create new. Never re-issue the same token
- **Separate secrets** — access tokens signed with `JWT_SECRET`, refresh operations use `JWT_REFRESH_SECRET` (even though we use opaque tokens, the config separation is good practice)
- **Set an expiry** — 7 days is common. Old tokens should be unreachable
- **Use `deleteMany` for logout** — it's idempotent. `delete` throws if the row doesn't exist (concurrent logout)  ‍

## Tradeoffs

| Approach | Pros | Cons |
|----------|------|------|
| Opaque token (ours) | Instant revocation, no tampering, DB is source of truth | DB lookup on every refresh |
| JWT refresh token | Self-validating, no DB read needed | Can't revoke without a blocklist, payload can be decoded |
| No rotation | Simple, fewer writes | Stolen token works until expiry |
| With rotation (ours) | Limits theft window, early detection | Extra DB write |

## Pitfalls

- **Race condition on refresh** — if two requests use the same refresh token simultaneously, one will fail (token already deleted by the other). The transaction's `delete` throws, the client retries with the new token. This is correct behavior.
- **Don't store raw tokens** — SHA-256 is a one-liner and prevents total account takeover if the DB is breached.
- **Transaction for rotation** — without one, a crash between delete and create destroys the session permanently.
- **Don't put bcrypt inside the transaction** — hash the password before opening the transaction. Bcrypt takes ~100ms and holds DB locks unnecessarily.
- **Clean up expired tokens** — they accumulate in the DB. A cron job or periodic `deleteMany where expiresAt < now()` prevents bloat.

## Key Points

- Refresh tokens are long-lived (7d), access tokens are short-lived (6h)
- Opaque tokens: random string → hash → store hash → return raw string
- Rotation: every refresh invalidates the old token and issues a new one
- Token rotation must be atomic — use a Prisma transaction
- Logout revokes a specific token (per-device logout)
- Refresh endpoints are public (access token is already expired when you need to refresh)
- Hashing tokens before storage protects against DB breaches
- Register returns tokens too so users skip the login step after signup
