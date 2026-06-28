# nudge-backend

## Stack

- **NestJS 11** + **TypeScript** (ES2023, nodenext module resolution)
- **Prisma 7** (PostgreSQL), client generated to `src/generated/prisma/` (CJS, gitignored)
- **class-validator** / **class-transformer** for DTO validation
- **Joi** for env validation (via `@nestjs/config`)
- **Jest** + **supertest** for testing

## Path aliases (tsconfig.json)

| Alias        | Maps to         |
| ------------ | --------------- |
| `@/*`        | `src/*`         |
| `@modules/*` | `src/modules/*` |
| `@common/*`  | `src/common/*`  |
| `@config/*`  | `src/config/*`  |

## Commands

| Command              | Action                                   |
| -------------------- | ---------------------------------------- |
| `npm run build`      | `nest build` (output `dist/`)            |
| `npm run start:dev`  | `nest start --watch`                     |
| `npm run start:prod` | `node dist/main`                         |
| `npm run lint`       | ESLint (with `--fix`)                    |
| `npm run test`       | Jest unit tests (`src/**/*.spec.ts`)     |
| `npm run test:e2e`   | Jest e2e tests (`test/**/*.e2e-spec.ts`) |

## Architecture

- **Entrypoint**: `src/main.ts` — creates NestJS app with global `ValidationPipe` (whitelist, transform, forbidNonWhitelisted), URI versioning (default v1), and `GlobalExceptionFilter`.
- **AppModule** (`src/app.module.ts`) — root module, imports `ConfigModule` (global), `HealthModule`, `PrismaModule`.
- **Health** — `GET /health` returns `{ status: 'ok', timestamp }`.
- **Modules** — feature modules live in `src/modules/` (currently only `auth/` with a `LoginDto`).
- **Prisma** — `PrismaService` (injectable) lives at `src/prisma/`. After `npx prisma generate`, import types from `@/generated/prisma/client`.
- **Global exception filter** at `src/common/filter/http-exception.filter.ts`.

## Prisma workflow

```bash
# Start Postgres (Docker)
docker compose up -d postgres

# After schema changes
npx prisma migrate dev --name <name>   # dev: apply + generate
npx prisma migrate deploy               # prod: apply pending migrations only
npx prisma generate                     # regenerate client (after pull, etc.)
```

Generated client output: `src/generated/prisma/` — committed per `.gitignore` exclusion; CI generates it.

## Config

- `.env` file with `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `docker compose up -d` starts Postgres 18.4-alpine on 5432
- `ApiConfigService` (`src/config/apiConfigService.ts`) wraps `ConfigService` for typed config access

## Linting & formatting

- **ESLint**: typescript-eslint (recommended-typechecked) + Prettier plugin
  - `@typescript-eslint/no-explicit-any`: off
  - `@typescript-eslint/no-floating-promises`: warn
  - DTO files (`.dto.ts`) exempt from `no-unsafe-call`
- **Prettier**: singleQuote, trailingComma es5 (run via `npm run format`)

## Testing quirks

- Unit tests use `Test.createTestingModule` from `@nestjs/testing`
- E2E tests at `test/app.e2e-spec.ts` use `test/jest-e2e.json` config (separate from Jest config in `package.json`)
- `deleteOutDir: false` in nest-cli — `dist/` is not cleaned on build

## Docs & learning preferences

Concept notes live in `notes/`. When creating or updating them:

- **Learning journey style** — explain _why_ things work, not just _what_ they do. Include tradeoffs and rationale behind decisions.
- **Code examples** — use real code from the project, not generic snippets.
- **Key points section** — end each doc with a bullet list for quick revisiting.
- **Practical over theoretical** — focus on what's actually used in this project. Skip generic framework tutorials.
- **Comparisons** — when covering a choice (example: UUID vs CUID, normalized vs denormalized), show pros/cons in a table.
- **Keep concise** — one topic per file, clear headings, scannable structure.

### Additional Guidelines

- **Explain the motivation** — what problem made us learn this concept?
- **Connect concepts** — link related docs (e.g. `Prisma Client` → `Transactions` → `Repository Pattern`).
- **Document decisions** — if we choose one approach over another, explain _why_ we rejected the alternatives.
- **Common mistakes** — include a short "Pitfalls" section for bugs or misconceptions encountered during development.
- **Best practices** — include project-relevant best practices, not generic framework advice.
- **Evolution** — if our understanding changes later, update the existing doc instead of creating duplicates.
- **Project context first** — explain how this concept is used in _this project_ before discussing broader use cases.
- **Examples from commits** — whenever possible, reference code we actually wrote to solve the problem.
- **Keep docs evergreen** — avoid documenting temporary code unless it explains an important design decision.
- **Question-driven headings** — prefer headings like "Why do we need transactions?" instead of "Transactions".
- **When to use / When not to use** — include both, especially for patterns and abstractions.
- **Assume future me forgot everything** — write notes that can be understood six months later without rereading framework docs.

### Note Template

````
# <Topic>

## Why did we need this?
What problem or requirement led us to learn this?

## How does it work?
Explain the concept in the context of this project.
Focus on the intuition before the implementation.

## Project Example

```
// Real code snippet from this project
```

## Best Practices
- ...
- ...

## Tradeoffs (if applicable)

| Option | Pros | Cons | Why we chose it |
| -------- | ---- | ---- | ---------------- |
| A | | | |
| B | | | |

## Pitfalls
- Common mistakes or bugs we encountered.
- Things to watch out for.

## Key Points
- ...
- ...
- ...
````
