# Learning Notes — nudge-backend

> A collection of detailed notes documenting concepts, patterns, and decisions
> used in this NestJS + Prisma backend project.

---

## Topics

| # | Topic | Key Idea |
|---|-------|----------|
| 1 | [NestJS Architecture](nestjs-architecture.md) | Modules, providers, DI, lifecycle |
| 2 | [Prisma ORM](prisma-orm.md) | Schema, migrations, client, queries |
| 3 | [Authentication & JWT](authentication-jwt.md) | Auth module, tokens, guards, strategies |
| 4 | [Validation & DTOs](validation-dtos.md) | class-validator, ValidationPipe, whitelist |
| 5 | [Configuration & Env](configuration.md) | Joi validation, ConfigModule, typed access |
| 6 | [Error Handling](error-handling.md) | Exception filters, structured error responses |
| 7 | [Database Design Decisions](database-design.md) | UUID vs CUID vs auto-increment, PK choices |
| 8 | [Docker & Deployment](docker-deployment.md) | Docker Compose, multi-stage build, prod |
| 9 | [Transaction Modeling](transaction-modeling.md) | INCOME/EXPENSE/TRANSFER in one table |
| 10 | [Recurring Transactions Design](recurring-transactions-design.md) | Scope, auto-creation, account deletion |
| 11 | [Prisma Migrations](prisma-migrations.md) | dev vs push vs deploy, when to use each |

---

### Quick reference

```bash
npm run start:dev    # dev server with watch
npm run build        # compile to dist/
npm run test         # unit tests
npm run test:e2e     # e2e tests
npm run lint         # ESLint + Prettier fix

docker compose up -d postgres   # start Postgres
npx prisma migrate dev          # apply schema changes
npx prisma generate             # regenerate client
```
