# Prisma Migrations: `dev` vs `push` vs `deploy`

## Why did we need this?

Prisma has three different commands for syncing your schema to the database,
and each serves a different purpose. Using the wrong one can delete data,
skip safety checks, or create migration files you didn't want.

---

## The three commands

### `prisma migrate dev` — for development only

```bash
npx prisma migrate dev --name <description>
```

**What it does:**
1. Diffs your Prisma schema against the last applied migration
2. Generates a new `.sql` migration file in `prisma/migrations/`
3. Applies it to the database
4. Runs `prisma generate`

**When to use:**
- When you're actively developing and changing the schema
- You want a **permanent record** (migration file) of every change
- You're committing migration files to git for deployment

**Danger zone:**
- If the database has data that conflicts with the new schema, Prisma will
  prompt you to reset (data loss) or edit the migration manually
- `--name` is required — keep it descriptive like `add-account-id-to-recurring-tx`

### `prisma migrate dev --create-only`

```bash
npx prisma migrate dev --create-only --name <description>
```

Generates the migration file **without applying it**. You can hand-edit the
SQL before running `prisma migrate dev` again to apply it. This is useful for
data migrations or custom SQL.

### `prisma migrate push` — prototype without history

```bash
npx prisma migrate push
```

**What it does:**
1. Pushes the current Prisma schema directly to the database
2. **Does not create migration files**
3. Creates/alters tables to match the schema

**When to use:**
- Rapid prototyping — iterate fast without generating migration files
- Initial schema setup in a fresh database
- You don't care about migration history (yet)

**Danger zone:**
- **Can delete data** — if you rename or remove a field, Prisma will drop
  the column and its data. It warns you but proceeds if you confirm.
- **No paper trail** — no migration file means you can't `migrate deploy`
  on production. You'd need to recreate the schema from scratch.
- For production-like environments, use `--accept-data-loss` to skip the
  warning (not recommended for production).

### `prisma migrate deploy` — for production/staging

```bash
npx prisma migrate deploy
```

**What it does:**
1. Reads the `prisma/migrations/` folder
2. Finds which migrations haven't been applied yet
3. Applies them in order
4. Does **not** run `prisma generate` (run it separately)

**When to use:**
- CI/CD pipelines
- Production deployments
- Any environment where you want clean, auditable migrations

**Safety guarantees:**
- **Never deletes data** — if a migration conflicts, it fails loudly instead
  of offering to reset
- **Never alters existing migration files** — the migrations are read-only
- **Idempotent** — safe to run multiple times (already-applied migrations are
  skipped)

---

## Visual comparison

| Command | Creates files | Applies to DB | Runs generate | Data-safe | Use case |
|---------|:---:|:---:|:---:|:---:|---------|
| `migrate dev` | ✅ | ✅ | ✅ | ⚠️ May prompt reset | Active development |
| `migrate dev --create-only` | ✅ | ❌ | ❌ | ✅ | Custom SQL editing |
| `migrate push` | ❌ | ✅ | ❌ | ❌ May drop data | Prototyping only |
| `migrate deploy` | ❌ | ✅ | ❌ | ✅ | Production/staging |
| `prisma generate` | ❌ | ❌ | ✅ | ✅ | After pull, before coding |

---

## Project workflow

In this project, we reset migrations at the start (fresh `--name init`) since
all models were new. The standard workflow going forward:

```bash
# 1. Change schema.prisma

# 2. Create + apply migration
npx prisma migrate dev --name what-changed

# 3. Commit both schema.prisma and the migration folder
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add X to Y"
```

On production/staging:

```bash
docker compose up -d postgres
npx prisma migrate deploy
npx prisma generate
```

---

## `prisma generate` — when to run it

```bash
npx prisma generate
```

This generates the Prisma Client to `src/generated/prisma/`. Run it:
- After pulling new migrations from git
- After `migrate dev` (it runs automatically)
- After `migrate deploy` (it does **not** run automatically!)
- In CI before building the app

The generated client is gitignored (see `.gitignore`) — CI regenerates it.

---

## Best Practices

- **Use `migrate dev` in development** — always. It's the only command that
  creates migration files, which are your audit trail.
- **Never use `migrate push` on a shared database** — it doesn't leave a
  record. If two developers push different schemas, you can't reconcile.
- **Never edit existing migration files** — they represent applied history.
  Create a new migration instead.
- **Always commit migration files** — they're the source of truth for
  deployment.
- **Run `migrate deploy` + `generate` separately in CI** — deploy then
  generate, don't combine with `migrate dev`.

---

## Pitfalls

- **`migrate dev` may ask to reset** — if your schema has breaking changes
  (removing a required column with existing data), Prisma will prompt you to
  reset the database. Say no and create a data migration, or accept data loss
  if it's dev-only data.
- **`migrate push` doesn't warn about data loss as loudly** — it asks once
  and proceeds. Don't use it when you have data you care about.
- **Migrate before coding** — always apply migrations before writing code
  that uses the new schema, or your Prisma Client types will be stale.
- **`prisma.config.ts` in Prisma 7** — this project uses the new Prisma 7
  config format. All commands work the same way.

---

## Key Points

- **`migrate dev`** = development workflow (creates files + applies +
  generates). Use this 95% of the time.
- **`migrate push`** = rapid prototyping only (no files, no history). Avoid
  on shared databases.
- **`migrate deploy`** = production (applies existing migrations, never
  deletes data). Run it in CI/CD.
- **`prisma generate`** = regenerate client after pulling or deploying.
  Separate step from deploy.
- Migration files are production artifacts — commit them, don't edit them.

---

## References

- [Prisma Migrate overview](https://www.prisma.io/docs/orm/prisma-migrate)
- [migrate dev vs push](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/migrate-dev-vs-push)
- [Deploying migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/production-and-ci-cd)
