# Prisma Seeding

## Why did we need this?

We needed default global categories (Food & Dining, Transportation, etc.) available for every user immediately after signup — without each user having to create them manually. Seeding is the standard Prisma mechanism to populate a database with reference / lookup data after migrations run.

As the project grows, we may also seed default budgets, account templates, or currency lookup tables. A single seed entry point handles all of them.

## How does seeding work in Prisma 7?

### Configuration

In Prisma 7, the seed command is defined in `prisma.config.ts` under `migrations.seed`:

```ts
// prisma.config.ts
export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
    seed: 'tsx ./prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
```

When you run `npx prisma db seed`, Prisma spawns a child process running `tsx ./prisma/seed.ts`. The script connects to the database, runs its logic, and exits. Prisma reports success or failure based on the exit code.

### The seed script

The seed script lives at `prisma/seed.ts` and is a standalone Node.js script — it does **not** use NestJS's DI, modules, or testing utilities. It creates its own `PrismaClient` instance and disconnects when done.

```ts
// prisma/seed.ts
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { TransactionType } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type SeedCategory = {
  name: string;
  type: TransactionType;
  icon: string;
};

const categories: SeedCategory[] = [
  { name: 'Food & Dining', type: 'EXPENSE', icon: '🍔' },
  { name: 'Transportation', type: 'EXPENSE', icon: '🚗' },
  { name: 'Shopping', type: 'EXPENSE', icon: '🛒' },
  { name: 'Entertainment', type: 'EXPENSE', icon: '🎬' },
  { name: 'Salary', type: 'INCOME', icon: '💰' },
];

async function main() {
  const result = await prisma.category.createMany({
    data: categories.map((category) => ({
      name: category.name,
      type: category.type,
      icon: category.icon,
      userId: null,
    })),
    skipDuplicates: true,
  });

  console.log(`Seeded ${result.count} categories`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

Key details:

- **`userId: null`** — these are global categories visible to all users. The API's `findAll` query uses `OR: [{ userId }, { userId: null }]` to return both the user's own and global categories.
- **`skipDuplicates: true`** — makes the seed idempotent. Running `npx prisma db seed` multiple times won't error on duplicates. It uses the `@@unique([name, userId])` constraint on the Category model.
- **`PrismaPg` adapter** — matches the same adapter used in `PrismaService` at runtime, ensuring consistent connection behavior (native PostgreSQL driver).
- **`tsx` over `ts-node`** — required because our tsconfig uses `nodenext` module resolution. `ts-node` chokes on `.js` extension imports that TypeScript expects with `nodenext`. `tsx` handles this transparently.

### Running the seed

```bash
docker compose up -d postgres   # start PostgreSQL if not running
npx prisma db seed              # apply seed
npx prisma migrate reset        # resets DB: drops all data, re-runs migrations, re-seeds
```

`migrate reset` is particularly useful during development — it gives you a clean database state.

## Best practices

### 1. Make seeds idempotent

Use `skipDuplicates: true` or `upsert` so re-running doesn't crash:

```ts
// With createMany — simple, fast, safe for first-time inserts
await prisma.category.createMany({
  data: categories,
  skipDuplicates: true,
});

// With upsert — when you need to update existing seed data too
await prisma.category.upsert({
  where: { name_userId: { name: 'Food & Dining', userId: null } },
  update: { icon: '🍕' },
  create: { name: 'Food & Dining', icon: '🍕', type: 'expense' },
});
```

| Approach | Pros | Cons | When to use |
|----------|------|------|-------------|
| `createMany` + `skipDuplicates` | Fast, simple, single query | Can't update existing rows | Initial seeding, reference data |
| `upsert` | Can update existing data | Slower (one query per row), more verbose | When seed data may need updates |

Stick with `skipDuplicates` for global lookup tables. Switch to `upsert` only if you need to update seeded data (e.g., renaming categories).

### 2. Keep seed data in arrays

```ts
const categories = [
  { name: 'Food & Dining', type: 'EXPENSE', icon: '🍔' },
  { name: 'Transportation', type: 'EXPENSE', icon: '🚗' },
  // ...
];
```

Arrays are readable, diff-friendly in git, and easy to extend. Avoid inline objects in `createMany`.

### 3. Use transactions for related data

When multiple entities depend on each other, wrap in `$transaction`:

```ts
await prisma.$transaction([
  prisma.category.createMany({ data: categories, skipDuplicates: true }),
  prisma.account.createMany({ data: accounts, skipDuplicates: true }),
]);
```

A transaction is all-or-nothing. If the second `createMany` fails, the first is rolled back. This prevents partial seed states.

### 4. Structure for future growth

One file is fine now. When you add more entities, refactor:

```
prisma/
  seed.ts              # entry point — orchestrates calls
  seed-data/
    categories.ts      # array of category seeds
    accounts.ts        # array of account seeds
    budgets.ts         # array of budget seeds
```

`seed.ts` then becomes:

```ts
import { categories } from './seed-data/categories';
import { accounts } from './seed-data/accounts';

async function main() {
  await prisma.$transaction([
    prisma.category.createMany({ data: categories, skipDuplicates: true }),
    prisma.account.createMany({ data: accounts, skipDuplicates: true }),
  ]);
}
```

Only extract when the single file feels crowded. No need to pre-optimize.

### 5. Don't share PrismaClient across seed modules

If you extract to multiple files, share the client via a simple module:

```ts
// prisma/client.ts
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
```

Then import it wherever needed. Avoid creating multiple `PrismaClient` instances.

### 6. Seed only reference data, not user data

| Seed ✅ | Don't seed ❌ |
|---------|--------------|
| Global categories (`userId: null`) | User-specific categories |
| Currencies, tax rates | Transactions, budgets |
| Enum-like lookup tables | Any row tied to a specific user |

Global seed data should have `userId: null` (or equivalent nullable FK). User-specific data comes in through API endpoints.

### 7. Validate the seed runs cleanly

```bash
# After a migration reset — drops DB, re-runs migrations, then seed
npx prisma migrate reset

# Or just re-run seed on existing data
npx prisma db seed
```

### 8. Connect seeding to `prisma.config.ts`, not `package.json`

| Prisma version | Where seed goes |
|----------------|-----------------|
| Prisma 6 and below | `package.json` → `"prisma": { "seed": "..." }` |
| Prisma 7 | `prisma.config.ts` → `migrations.seed` |

If both are set, Prisma 7 prefers `prisma.config.ts`. Ours is correctly configured in `prisma.config.ts`.

## When to seed vs when to use a migration

| Scenario | Tool | Why |
|----------|------|-----|
| Add a new default category | Seed | Data changes frequently, idempotent |
| Rename a column | Migration | Schema change, not data |
| Remove a default category | Seed (add a removal step) | Data operation, not schema |
| Add a unique constraint | Migration | Schema change |
| Backfill existing rows with defaults | Migration (or seed + script) | Depends on context |

The rule of thumb: **schema changes → migration, data changes → seed**.

## Pitfalls

- **Missing `.env`** — the seed script reads `DATABASE_URL` from the environment. If `.env` is missing or `dotenv` isn't loaded, the connection fails. `prisma.config.ts` already imports `dotenv/config`, but the seed script relies on Prisma CLI loading it.
- **PrismaClient import path** — our client is generated to `src/generated/prisma/` (not the default `node_modules/.prisma/client`). The import must use the correct relative path.
- **`createMany` with Postgres adapter** — some Prisma adapters don't support `createMany`. `PrismaPg` does, but worth verifying when adding a new adapter.
- **`skipDuplicates` requires a unique constraint** — without one, Prisma can't determine what constitutes a duplicate. Our `@@unique([name, userId])` on Category makes it work.
- **Re-running seed creates duplicate global categories if skipDuplicates is missing** — always include `skipDuplicates` or use `upsert`.
- **`npx prisma db seed` vs `npx prisma migrate reset`** — the latter drops and recreates the database, applies all migrations, then runs the seed. The former just re-runs the seed on existing data. Use `reset` for a clean state.

## Key Points

- Seeding populates reference/lookup data (global categories, etc.) after migrations
- The seed command lives in `prisma.config.ts` → `migrations.seed`
- The seed script is a standalone Node.js script, not part of NestJS
- Use `skipDuplicates: true` for idempotency
- Use `$transaction` when seeding multiple related entities
- `PrismaPg` adapter matches the runtime adapter in `PrismaService`
- `tsx` handles `nodenext` module resolution; `ts-node` does not
- Seed data should have `userId: null` for global availability
- Extract to `prisma/seed-data/` when the file grows beyond one entity
- Schema changes go in migrations, data changes go in seeds
