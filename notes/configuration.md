# Configuration & Environment Variables

## Overview

NestJS provides a `@nestjs/config` module (built on top of `dotenv`) for
managing configuration. This project uses:

1. **`.env` file** — stores secrets and environment-specific values
2. **`ConfigModule.forRoot()`** — loads and validates env vars
3. **`configuration()`** — returns a typed configuration object
4. **`Joi` validation schema** — validates at startup, fails fast
5. **`ApiConfigService`** — typed wrapper for injection

---

## 1. `.env` File

Located at the project root (gitignored):

```env
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://nudge_user:nudge_pass@localhost:5432/nudge_db?schema=public"
JWT_SECRET=your-super-secret-change-me
JWT_REFRESH_SECRET=another-secret-change-me
```

**Key points:**
- Never commit `.env` to git
- `.env` is loaded automatically by `@nestjs/config`
- Template should be documented but not contain real secrets

---

## 2. ConfigModule Registration (`src/app.module.ts`)

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  load: [configuration],
  cache: true,
  validationSchema: envValidationSchema,
})
```

| Option | Purpose |
|--------|---------|
| `isGlobal: true` | Available in all modules without re-importing |
| `load: [configuration]` | Custom function that returns a config object |
| `cache: true` | Caches the config for performance |
| `validationSchema` | Joi schema — validates env at startup |

---

## 3. Configuration Function (`src/config/configuration.ts`)

```typescript
export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT as string, 10) || 3000,
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
  },
});
```

**Key points:**
- Returns a nested object — access values via `configService.get('database.url')`
- TypeScript: the return type becomes the type of the config object
- Default values for optional vars (like `NODE_ENV`, `PORT`)

---

## 4. Joi Validation (`src/config/envValidationSchema.ts`)

```typescript
import Joi from 'joi';

export const envValidationSchema = Joi.object({
  nodeEnv: Joi.string().valid('development', 'production', 'test').default('development'),
  port: Joi.number().default(3000),
  database: Joi.object({
    url: Joi.string().required(),
  }),
  jwt: Joi.object({
    secret: Joi.string().required(),
    refreshSecret: Joi.string().required(),
  }),
});
```

**Key points:**
- Validates the config object (not raw `process.env`)
- `.required()` — fails startup if missing
- `.default()` — provides fallback
- `.valid()` — restricts to allowed values
- Joi runs **before the app starts** — no silent failures

---

## 5. ApiConfigService (`src/config/apiConfigService.ts`)

A typed, injectable wrapper around `ConfigService`:

```typescript
@Injectable()
export class ApiConfigService {
  constructor(private configService: ConfigService) {}

  get port(): number {
    return this.configService.getOrThrow('port');
  }

  get nodeEnv(): string {
    return this.configService.getOrThrow('nodeEnv');
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }
}
```

**Key points:**
- `getOrThrow()` — throws if the key is missing (defensive)
- Exposes config as **getter properties** — clean API
- Injectable anywhere via DI — `constructor(private config: ApiConfigService) {}`
- Type-safe — no magic strings outside this service

---

## Key Points to Remember

- **Config loads before app boots** — validation errors crash immediately
- **`isGlobal: true`** means you never re-import `ConfigModule` in feature modules
- **`ApiConfigService`** is the preferred way to access config in providers
- **`getOrThrow()`** for required values, `.get()` with default for optional
- **Joi schema must match** the shape returned by `configuration()`
- **Dotenv is automatic** — `@nestjs/config` loads `.env` by default

---

## References

- [@nestjs/config](https://docs.nestjs.com/techniques/configuration)
- [Joi](https://joi.dev/)
