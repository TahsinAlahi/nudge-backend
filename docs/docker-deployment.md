# Docker & Deployment

## Overview

This project uses Docker for local development (Postgres) and has a production
Dockerfile ready. The app itself runs on Node.js, and we containerize both the
database and the application.

---

## Docker Compose (`docker-compose.yml`)

```yaml
services:
  postgres:
    image: postgres:18.4-alpine
    container_name: nudge_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: nudge_user
      POSTGRES_PASSWORD: nudge_pass
      POSTGRES_DB: nudge_db
    ports:
      - 5432:5432
    volumes:
      - postgres_data:/var/lib/postgresql

  app:
    build: .
    depends_on:
      - postgres
    ports:
      - 3000:3000
    env_file: .env

volumes:
  postgres_data:
```

### Key Points

- **`postgres:18.4-alpine`** — lightweight Alpine-based Postgres 18.4
- **Named volume** `postgres_data` — persists data across container restarts
- **`depends_on`** — app waits for postgres (but doesn't wait for it to be
  *ready* — you may need a health check or wait script)
- **`env_file: .env`** — passes env vars from `.env` to the container
- **Port 5432:5432** — exposes Postgres on host port 5432

### Common Commands

```bash
# Start Postgres only
docker compose up -d postgres

# Start everything
docker compose up -d

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Stop + delete volumes (⚠️ deletes data)
docker compose down -v
```

---

## Dockerfile (Multi-Stage Build)

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
```

### Stage 1: Builder

- Uses `node:22-alpine` — small base image
- `npm ci` — clean install (uses lockfile, fails if lockfile is out of sync)
- `npm run build` — compiles TypeScript to `dist/`

### Stage 2: Production

- Fresh image — no build tools or dev dependencies
- `npm ci --omit=dev` — installs only production dependencies
- Copies only `dist/` — no source code in production image
- `CMD ["node", "dist/main"]` — runs compiled JS directly (no `nest start`)

---

## Production Considerations

### Environment Setup

For production, you need these env vars:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=<random-64-char-string>
JWT_REFRESH_SECRET=<another-random-64-char-string>
```

### Migrations in Production

Migrations are **not** run automatically by the app. You run them explicitly:

```bash
# After deploying new code with schema changes
npx prisma migrate deploy
```

In a containerized deployment, this is typically done as a separate
one-off task or init container before the app starts.

### Building and Running

```bash
# Build the image
docker compose build

# Or build manually
docker build -t nudge-backend .

# Run
docker run -p 3000:3000 --env-file .env nudge-backend
```

---

## Key Points to Remember

- **`npm ci` vs `npm install`** — `ci` is stricter (respects lockfile exactly)
  and faster; use it in CI/Docker builds
- **`--omit=dev`** — production image has no dev dependencies (no TypeScript,
  no Jest, no ESLint)
- **`dist/main` is the entrypoint** — `nest start` not needed in production
- **Migrations are manual** — `npx prisma migrate deploy` is a separate step
- **Postgres on Alpine** — 18.4-alpine is ~150MB vs full image ~400MB
- **`deleteOutDir: false`** in `nest-cli.json` — `dist/` is not cleaned on
  rebuild, beware of stale files if switching branches

---

## References

- [Docker Compose docs](https://docs.docker.com/compose/)
- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Prisma deploy](https://www.prisma.io/docs/orm/prisma-migrate/workflows/production-and-ci-cd)
