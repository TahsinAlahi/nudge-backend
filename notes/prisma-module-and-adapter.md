# Prisma Module & Driver Adapter (PrismaPg)

## Why did we need this?

Prisma traditionally uses a **binary engine** — a Rust binary that sits between
your Node.js app and PostgreSQL, translating Prisma queries into SQL. This
works but has downsides:

- Requires downloading native binaries per platform (slow CI, Docker issues)
- Adds ~20-30ms overhead per query (IPC between Node and the binary)
- Doesn't integrate with Node.js connection poolers like `pg-pool` or
  PgBouncer

Prisma 7 introduced **driver adapters** — a way to use the Node.js `pg`
driver directly instead of the binary engine. `@prisma/adapter-pg` (PrismaPg)
is the PostgreSQL adapter.

---

## How does it work?

Instead of:

```
App → Prisma Client → Binary Engine → PostgreSQL
```

With PrismaPg:

```
App → Prisma Client → pg driver (Node.js) → PostgreSQL
```

No binary engine. The `pg` driver handles the connection, queries go directly.
This means:

- **No native binaries** — cleaner Docker images, faster CI
- **Less overhead** — no IPC between Node and Rust binary
- **Standard connection pooling** — use `pg-pool` or PgBouncer
- **Smaller deploy size** — no need for the Prisma query engine binary

---

## Project Example

### The old approach (Prisma 6 and earlier)

```typescript
@Injectable()
export class PrismaService extends PrismaClient {
  async onModuleInit() {
    await this.$connect();
  }
}
```

### Our approach (Prisma 7 with PrismaPg)

From `src/prisma/prisma.service.ts`:

```typescript
import { PrismaClient } from '@/generated/prisma/client';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: configService.getOrThrow('DATABASE_URL'),
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

### The PrismaModule

From `src/prisma/prisma.module.ts`:

```typescript
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

**Two important details:**

1. **`@Global()`** — makes PrismaService available in all modules without
   importing PrismaModule everywhere. Feature modules just inject
   `PrismaService` directly.

2. **`exports: [PrismaService]`** — without this, even with `@Global()`, the
   service wouldn't be visible. `@Global()` only makes the module's exports
   global, it doesn't auto-export.

### How it's used in a service

```typescript
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
}
```

---

## Why `ConfigService` in PrismaService?

The PrismaPg adapter needs the `DATABASE_URL`. Instead of reading
`process.env` directly, we inject `ConfigService` — this means:

- The URL is validated by Joi before PrismaService is ever created
- We can change the source without touching PrismaService (env, vault, etc.)
- Consistent with the rest of the app (all config flows through ConfigService)

---

## Tradeoffs

| Aspect | Binary Engine | PrismaPg (driver adapter) |
|--------|--------------|--------------------------|
| Setup | Downloads per platform | Pure JS, no native deps |
| Query overhead | IPC between Node + Rust | Direct in-process |
| Connection pooling | Limited | Full `pg-pool` support |
| Prisma studio | Works natively | Requires adapter config |
| Edge/runtime support | No | Yes (works on Cloudflare Workers, etc.) |

**Why we chose PrismaPg:** Smaller Docker images, faster cold starts, and no
native binary headaches in CI. For a NestJS app running in containers, this
is the cleaner approach.

---

## Prisma schema config

From `prisma.schema`:

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}
```

- `provider = "prisma-client"` — Prisma 7 syntax (was `"prisma-client-js"`)
- `output = "../src/generated/prisma"` — generated client inside src
- `moduleFormat = "cjs"` — CommonJS output (compatible with NestJS)
- Generated code is **gitignored** (see `.gitignore`), regenerated on
  `npx prisma generate`

---

## Generated client import

```typescript
import { PrismaClient } from '@/generated/prisma/client';
```

The path alias `@/*` maps to `src/*`, so this resolves to
`src/generated/prisma/client.ts`. Never import from `@prisma/client` directly
— the generated output is at the custom path.

---

## Pitfalls

- **Don't import from `@prisma/client`** — the generated client is at
  `@/generated/prisma/client`. The `@prisma/client` package is just the
  runtime library, not the generated types.
- **`@Global()` without `exports` does nothing** — the provider must be
  in `exports` for `@Global()` to work.
- **PrismaPg requires `pg` package** — `@prisma/adapter-pg` is the adapter,
  `pg` is the actual PostgreSQL driver. Both are needed.
- **Connection string format** — `postgresql://user:pass@host:5432/db`.
  PrismaPg passes this directly to `pg`.
- **`onModuleDestroy` is critical** — without it, dangling connections keep
  the process alive and prevent graceful shutdown.

---

## Key Points

- `@prisma/adapter-pg` replaces the Prisma binary engine with the Node.js
  `pg` driver — no native binaries needed
- `PrismaPg` adapter is created with `DATABASE_URL` from `ConfigService`
- `PrismaModule` is `@Global()` — feature modules don't need to import it
- Import `PrismaClient` from `@/generated/prisma/client`, not `@prisma/client`
- Lifecycle: `$connect()` on module init, `$disconnect()` on destroy
- Generated client is gitignored — CI regenerates it via `prisma generate`

---

## References

- [Prisma Driver Adapters](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/drivers-and-generators/driver-adapters)
- [@prisma/adapter-pg](https://www.prisma.io/docs/orm/reference/prisma-client-reference#driver-adapters)
- [Prisma Client setup](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration)
