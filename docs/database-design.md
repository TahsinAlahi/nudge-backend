# Database Design Decisions

## The ID Problem: How to identify records?

Every database table needs a primary key. The question is: **what kind of ID
should we use?**

---

## Option 1: Auto-increment Integer

```prisma
id  Int  @id @default(autoincrement())
```

**Pros:**
- Smallest storage (4 bytes)
- Fast for JOINs and indexes
- Human-readable, sequential
- Built into every database

**Cons:**
- **Exposes record count** — `GET /users/100` tells anyone you have 100 users
- **Enumeration attacks** — iterate IDs to scrape all data
- **Conflicts on merge** — two databases with the same sequence clash
- **URL collision** — short IDs are easy to guess
- **Overflow** — `INT` maxes at 2.1 billion, `BIGINT` at 9.2 quintillion

### What happens on INT overflow?

In PostgreSQL, when a signed `INT` reaches 2,147,483,647, the next `INSERT`
fails with:
```
ERROR: integer out of range
```

No wraparound (unlike MySQL unsigned). The app crashes on write. You'd need to
migrate the column to `BIGINT`.

> For a typical web app, you won't hit INT max anytime soon. But if you store
> events, logs, or IoT data, overflow is real.

---

## Option 2: UUID (v4)

```prisma
id  String  @id @default(uuid())
```

UUID v4 is a 128-bit random value: `550e8400-e29b-41d4-a716-446655440000`

**Pros:**
- **Globally unique** — no coordination needed across servers
- **Unguessable** — no sequential enumeration
- **Safe to expose** — use in URLs, API responses
- **Merge-friendly** — no conflicts when combining databases

**Cons:**
- **16 bytes** — larger than int, slower on huge tables
- **Random** — causes B-tree index fragmentation (new inserts go to random
  pages instead of sequentially)
- **36 chars as string** — more storage if stored as text vs binary
- **Harder to debug** — can't remember "that user with ID 42"

---

## Option 3: UUID v7 (Time-Sorted UUID)

UUID v7 is the same 128 bits but: **timestamp prefix + random suffix**.

**Pros:**
- Same uniqueness + unguessability as UUID v4
- **Sortable by creation time** — no B-tree fragmentation
- **Monotonically increasing** — database-friendly

**Cons:**
- Newer standard — Prisma doesn't have `@default(uuid7())` yet
- Need to generate on the application side or via DB extension

---

## Option 4: CUID

```prisma
id  String  @id @default(cuid())
```

CUID (Collision-resistant Unique IDentifier) is a 25-character URL-safe ID:
`ck4d7h3j0000i3b6x5f6g7h8i`

**Structure:** timestamp + counter + host fingerprint + random

**Pros:**
- **Sortable** by creation time
- **URL-safe** — no hyphens like UUID
- **Shorter than UUID** (25 vs 36 chars)
- **Globally unique** across servers

**Cons:**
- Not a formal standard
- Slightly slower to generate than UUID
- Not as widely supported/documented

---

## Option 5: Dual-ID Pattern (Int PK + UUID public ID)

```prisma
model User {
  id        Int      @id @default(autoincrement())
  publicId  String   @unique @default(uuid())
  // ...
}
```

**Pros:**
- Best of both — fast int PK for JOINs, safe UUID for public APIs
- Small foreign keys in related tables

**Cons:**
- **Complexity** — every table needs two IDs, two indexes
- **More code** — your service layer always resolves UUID → int
- **Premature optimization** — for most apps, the benefit is negligible

**When to use it:**
- Billions of rows where index size matters
- Very deep JOIN chains across many related tables
- Profiling has proven int PK is measurably faster

---

## Recommendation for This Project

For a NestJS backend in early development:

| Approach | Verdict |
|----------|---------|
| Auto-increment | ❌ Exposes record count, enumeration risk |
| UUID v4 | ✅ Fine — simple, safe, Prisma built-in |
| UUID v7 | ✅ Better, but needs manual generation |
| CUID | ✅ Good — sortable, URL-safe |
| Dual-ID | ❌ Premature complexity |

**Start with UUID v4** (already in the schema). It's simple, safe, and Prisma
supports it natively. If performance ever becomes an issue, switch to UUID v7
or CUID — both are backward-compatible (same `String` type).

---

## Key Points to Remember

- **`@default(uuid())`** — Prisma generates UUID v4
- **Sortable IDs** are better for database performance (CUID, UUID v7)
- **INT overflows at 2.1B** — PostgreSQL throws, doesn't wrap
- **`BIGINT`** — use `@db.BigInt` for 64-bit if you must auto-increment
- **Dual-ID is a tradeoff** — cleaner joins vs. code complexity
- **For this project: UUID is fine** — don't optimize prematurely

---

## References

- [UUID vs CUID](https://www.npmjs.com/package/@paralleldrive/cuid2)
- [UUID v7 Standard](https://www.ietf.org/rfc/rfc9562.html)
- [Prisma ID fields](https://www.prisma.io/docs/orm/prisma-schema/data-model/models#id-fields)
