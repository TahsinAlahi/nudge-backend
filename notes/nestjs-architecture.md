# NestJS Architecture

## What is NestJS?

NestJS is a progressive Node.js framework for building efficient, reliable, and
scalable server-side applications. It uses **TypeScript** by default and
combines elements of **OOP** (Object-Oriented Programming), **FP** (Functional
Programming), and **FRP** (Functional Reactive Programming).

Under the hood, NestJS uses **Express** (default) or **Fastify** for HTTP
handling, but adds a layer of abstraction on top.

---

## Core Concepts

### 1. Modules

Every NestJS app has at least one module — the **root module** (`AppModule`).
Modules are the building blocks that organize your code into cohesive units.

**Our root module** (`src/app.module.ts`):

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validationSchema: envValidationSchema }),
    HealthModule,
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

**Key points:**
- `imports` — other modules to pull in
- `controllers` — route handlers for this module
- `providers` — services/factories that can be injected
- `exports` — providers to share with other modules

### 2. Controllers

Controllers handle incoming HTTP requests and return responses. They are
decorated with `@Controller()` and use method decorators for routing.

**Example** (`src/health/health.controller.ts`):

```typescript
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(200)
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

**Key points:**
- Route path is set in `@Controller('path')`
- Method decorators: `@Get()`, `@Post()`, `@Put()`, `@Delete()`, `@Patch()`
- `@HttpCode()` overrides the default status code
- Return value is automatically serialized to JSON

### 3. Providers (Services)

Providers are classes annotated with `@Injectable()`. They can be injected into
controllers or other providers via **dependency injection**.

**Example** (`src/app.service.ts`):

```typescript
@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
```

**Key points:**
- `@Injectable()` marks the class as a provider
- Providers are registered in the module's `providers` array
- Constructor injection: `constructor(private readonly service: AppService) {}`

### 4. Dependency Injection (DI)

NestJS has a built-in DI container. When you declare a provider in a module,
NestJS creates a singleton instance and injects it wherever requested.

```typescript
// Controller requesting a service
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}
  //          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //          Shorthand: declares + injects appService
}
```

**Key points:**
- Default scope is **singleton** (one instance for the whole app)
- Scopes can be changed: `@Injectable({ scope: Scope.REQUEST })`
- DI reduces coupling and makes testing easier

---

## How This Project Is Wired

```
main.ts
  └─> AppModule
        ├─> ConfigModule (global — env vars, validation)
        ├─> HealthModule (controller: GET /health)
        ├─> PrismaModule (database access)
        ├─> AppController (root route)
        └─> AppService
```

**main.ts** creates the NestJS app, attaches global pipes and filters:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  await app.listen(process.env.PORT ?? 3000);
}
```

---

## Key Points to Remember

- **`@Module({})`** — every NestJS app needs at least one
- **Controllers** — handle HTTP, one per route group
- **Providers** — injectable services, singletons by default
- **DI** — constructor injection is the standard pattern
- **Global setup** — pipes, filters, guards can be global (app-wide) or
  scoped (controller/method level)
- **URI versioning** — enabled with default version `1`, so routes are
  e.g. `/v1/health` if you use versioned controllers
- **Entrypoint** — `src/main.ts`, never put business logic here

---

## References

- [NestJS Docs](https://docs.nestjs.com/)
- [NestJS Fundamentals Course](https://docs.nestjs.com/first-steps)
