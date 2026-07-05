# Prisma ORM

## What is Prisma?

Prisma is an **ORM** (Object-Relational Mapper) for Node.js and TypeScript. It
replaces traditional ORMs with a type-safe database client that gives you
autocompletion, compile-time checks, and a declarative schema language.

---

## Key Components

### 1. Prisma Schema (`prisma/schema.prisma`)

The schema is the single source of truth for your database. It defines:

- **Data source** — which database you're using (PostgreSQL)
- **Generator** — where and how to generate the client
- **Models** — your database tables

**Our schema:**

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}

model User {
  id        String    @id @default(uuid())
  name      String
  email     String    @unique
  password  String
  avatar    String
  isDeleted Boolean   @default(false)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
}
```

**Key points:**
- `@id` — primary key
- `@default(uuid())` — auto-generate UUID v4
- `@unique` — unique constraint
- `@default(now())` — timestamp on creation
- `@updatedAt` — auto-updates on record change
- `?` — optional / nullable field

### 2. Prisma Client (`src/generated/prisma/`)

Generated TypeScript client with full type safety. After `npx prisma generate`,
the client is output to `src/generated/prisma/`.

This directory is **gitignored** (see `.gitignore`), so CI regenerates it.

```typescript
import { PrismaClient } from '@/generated/prisma/client';
// or using path alias: @/generated/prisma/client

const prisma = new PrismaClient();
const users = await prisma.user.findMany();
```

### 3. PrismaService (`src/prisma/prisma.service.ts`)

A NestJS wrapper around PrismaClient for proper DI:

```typescript
@Injectable()
export class PrismaService {}  // wraps PrismaClient
```

Currently a stub — will extend `PrismaClient` and handle lifecycle (connect
on module init, disconnect on destroy).

---

## Common Operations

```typescript
// Create
const user = await prisma.user.create({
  data: { name: 'Alice', email: 'alice@example.com', password: '...', avatar: '...' },
});

// Read
const user = await prisma.user.findUnique({ where: { email: 'alice@example.com' } });
const users = await prisma.user.findMany({ where: { isDeleted: false } });

// Update
await prisma.user.update({
  where: { id: 'some-uuid' },
  data: { name: 'Bob' },
});

// Soft delete
await prisma.user.update({
  where: { id: 'some-uuid' },
  data: { isDeleted: true, deletedAt: new Date() },
});

// Hard delete
await prisma.user.delete({ where: { id: 'some-uuid' } });
```

---

## Migration Workflow

```bash
# Start Postgres
docker compose up -d postgres

# After changing schema.prisma — dev (apply + generate)
npx prisma migrate dev --name describe_the_change

# Production — apply pending migrations only
npx prisma migrate deploy

# Regenerate client (after pulling new migrations, or if client is stale)
npx prisma generate
```

**Migration files** are stored in `prisma/migrations/` and should be committed.

---

## findUnique vs findFirst

### The difference

| Method | Where clause accepts | Use case |
|--------|---------------------|----------|
| `findUnique` | Only `@id`, `@unique`, or `@@unique` fields | Exact lookup by unique identifier |
| `findFirst` | Any fields, including non-unique | Lookup with additional filters |

### The common mistake

```typescript
// ❌ isDeleted is NOT a unique field — Prisma throws
prisma.user.findUnique({
  where: { id, email, isDeleted: false },
});
```

`findUnique` validates that every field in `where` is part of a unique
constraint. `isDeleted` is not unique, so Prisma rejects the query.

### The fix

```typescript
// ✅ Use findUnique for the lookup, then filter manually
const user = await prisma.user.findUnique({ where: { id } });
if (!user || user.isDeleted) return null;
```

**Or** use `findFirst` when you don't have a unique constraint for the filter:

```typescript
prisma.user.findFirst({
  where: { id, email, isDeleted: false },
});
```

`findFirst` accepts any fields in `where` — no uniqueness constraint required.

### When to use each

- `findUnique` is **faster** (direct index lookup) — use for primary lookups
- `findFirst` is **more flexible** — use when filtering by non-unique fields

---

## Key Points to Remember

- **`npx prisma generate`** — run after every `git pull` that might have new
  schema changes
- **Generated code is gitignored** — never edit it directly, and never commit it
- **Import from `@/generated/prisma/client`** — not from `@prisma/client`
- **Model name maps to table name** — `User` → `users` (Prisma pluralizes)
- **Field types map to database types** — `String` → `text`, `Int` → `integer`,
  `Boolean` → `boolean`, `DateTime` → `timestamp`
- **Soft delete pattern** — use `isDeleted` + `deletedAt` instead of hard
  deletes for data retention

---

## References

- [Prisma Docs](https://www.prisma.io/docs)
- [Prisma Schema Reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)
- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate)
