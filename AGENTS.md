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
