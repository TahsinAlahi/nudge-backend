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
| 12 | [Prisma Module & Driver Adapter](prisma-module-and-adapter.md) | PrismaPg, @Global(), lifecycle |
| 13 | [Runtime vs Compile-time, Validation Pipeline](runtime-vs-compiletime-validation.md) | Classes vs interfaces, decorators, ValidationPipe flow, URI versioning |
| 14 | [Auth Module Implementation](auth-implementation.md) | Passport JWT in practice, factories, payload conventions, Prisma select pitfalls |
| 15 | [Global Guards and @Public()](guards-decorators-and-reflection.md) | APP_GUARD, Reflector, @Public() decorator pattern |
| 16 | [Custom Parameter Decorators](custom-parameter-decorators.md) | createParamDecorator, @CurrentUser(), Express request typing |
| 17 | [Prisma Seeding](prisma-seeding.md) | Seed configuration, idempotency, best practices |
| 18 | [Transaction CRUD Service](transaction-crud-service.md) | Balance apply/reverse, soft delete, ownership scoping |
| 19 | [Pagination with Prisma](prisma-pagination.md) | skip/take offset pagination, count, meta envelope |
| 20 | [Batch $transaction vs Promise.all](prisma-batch-vs-promiseall.md) | Consistency vs concurrency for parallel queries |

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
