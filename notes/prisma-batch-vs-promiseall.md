# `$transaction([...])` vs `Promise.all([...])` for Parallel Queries

## Why did we need this?

When building the transactions listing, we needed to fetch one page of transactions **and** the total count. Two queries, no dependency between them — so both should run concurrently.

But there are two idiomatic ways to write this in Prisma:

```typescript
// Option A — Prisma batch transaction
const [transactions, total] = await prisma.$transaction([
  prisma.transaction.findMany({ ... }),
  prisma.transaction.count({ where }),
]);

// Option B — JavaScript concurrency
const [transactions, total] = await Promise.all([
  prisma.transaction.findMany({ ... }),
  prisma.transaction.count({ where }),
]);
```

They *look* interchangeable. They are **not** — the difference is database transaction semantics. This note is about choosing the right one.

## How does it work?

### Option A: `prisma.$transaction([...])` — batch form

Prisma sends both queries inside a **single database transaction** (`BEGIN` … `COMMIT`). The database gives both queries a **consistent snapshot**: the `findMany` and `count` see the exact same state, even if another client inserts or deletes rows between them.

Costs:
- The transaction holds one connection for its whole duration.
- The batch executor may run the queries **serially** over that single connection rather than in true parallel.
- The array form is read/write-aggregate only — **you cannot do conditional logic** (read a value, decide, then write) inside it.

### Option B: `Promise.all([...])` — JavaScript concurrency

Each Prisma query is an independent, auto-committed statement on its own connection from the pool. `Promise.all` just awaits both promises.

- The database can execute them on **separate connections** → true parallelism.
- No shared snapshot: under a concurrent write, `count` may reflect a row that `findMany` doesn't yet (or vice versa).

### A third sibling: the interactive transaction

`prisma.$transaction(async (tx) => { ... })` is the callback form used for multi-step **write** flows where later operations depend on earlier reads (check-then-create, balance updates). It's what `create`/`update`/`remove` use in the transaction service — see `prisma-transactions.md` and `transaction-crud-service.md`.

## Project Example

Our `findAll` in `src/modules/transactions/transactions.service.ts` uses **`Promise.all`**:

```typescript
const [transactions, total] = await Promise.all([
  this.prisma.transaction.findMany({
    where, include: this.include, skip, take: limit, orderBy: { date: 'desc' },
  }),
  this.prisma.transaction.count({ where }),
]);

return {
  data: transactions,
  meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
};
```

The batch-transaction equivalent would *look* the same but changes the semantics:

```typescript
const [transactions, total] = await this.prisma.$transaction([
  this.prisma.transaction.findMany({ ... }),
  this.prisma.transaction.count({ where }),
]);
```

## Tradeoffs

| Aspect | `$transaction([...])` (batch) | `Promise.all([...])` | Winner for listings |
| ------ | ---------------------------- | -------------------- | ------------------- |
| **Consistency** | Both queries see one snapshot | Tiny window where count & data can disagree | Batch |
| **Concurrency** | May serialize on one connection | True parallel across pool | Promise.all |
| **Connection usage** | Holds 1 connection through the transaction | Uses 2 briefly | Promise.all |
| **Conditional logic** | Not possible (no code between queries) | Not possible either (no shared tx) | — |
| **Simplicity / mental model** | Adds transaction overhead to reads | Plain JS — easy to reason about | Promise.all |

### When to use which

- **`Promise.all`** for independent *read-only* queries where a momentary count/data skew is harmless — the default for paginated listings like our `findAll`.
- **`$transaction([...])` (batch)** for read-only queries that must agree on an exact snapshot — e.g. financial reconciliation, report exports, dashboards where a mismatched total is a bug.
- **`$transaction(async (tx) => ...)` (interactive)** for any flow with *read-then-write* logic that must be atomic — every balance-mutating operation in the transaction service.

## Pitfalls

- **Don't reach for `$transaction([...])` out of habit for read-only queries.** You pay transaction overhead (connection held, potential serialization) for a consistency guarantee a listing page usually doesn't need.
- **The batch form is NOT a place for conditional logic.** If you need to read a value and branch on it, that's the interactive callback form, not the array form.
- **`Promise.all` is not atomic.** If a client inserts a row between the two queries, `data.length` and `meta.total` can legitimately disagree for that one response — acceptable for lists, unacceptable for money reconciliation.
- **Don't confuse the three forms.** The array form and the callback form are both called `$transaction` but behave differently. The callback form is the only one that lets you sequence dependent operations.

## Key Points

- `prisma.$transaction([...])` runs queries in one DB transaction → consistent snapshot, but may serialize and holds a connection
- `Promise.all([...])` runs independent auto-commit queries → true parallelism, but no shared snapshot
- Our `findAll` uses `Promise.all` because listings tolerate tiny count skew and benefit from concurrency + no transaction overhead
- Use the batch form when reads must agree on the same state (reports, reconciliation)
- Use the interactive callback form for atomic read-then-write flows (create/update/remove balances)
- All three forms exist; pick by *what guarantee the operation actually needs*
