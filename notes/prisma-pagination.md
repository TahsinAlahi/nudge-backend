# Pagination with Prisma (skip/take)

## Why did we need this?

`findMany` without limits returns **every** matching row. For a transactions list that grows forever, that means:
- Huge JSON payloads and slow response times.
- The frontend re-rendering thousands of DOM nodes.
- No way for the client to show "page 3 of 10" or infinite scroll.

We needed a standard, predictable way to slice a collection and tell the client what it got.

## How does it work?

### Offset pagination

The most common pattern: the client passes a **page number** and a **page size**, and the server computes how many rows to skip.

```typescript
const page = query.page ?? 1;      // which page (1-based)
const limit = query.limit ?? 20;   // how many rows per page
const skip = (page - 1) * limit;   // how many rows to jump over
```

| page | limit | skip | take | rows returned |
|------|-------|------|------|---------------|
| 1 | 20 | 0 | 20 | 1–20 |
| 2 | 20 | 20 | 20 | 21–40 |
| 3 | 20 | 40 | 20 | 41–60 |

`skip` = rows to jump, `take` = rows to fetch. Prisma maps these directly to SQL `OFFSET`/`LIMIT`.

### Counting the total separately

The server can't know how many pages exist from the current page alone, so it issues a second query — `count` — with the **same `where` filter but no `skip`/`take`**. The two queries are independent, so we run them in parallel:

```typescript
const [transactions, total] = await Promise.all([
  this.prisma.transaction.findMany({ where, include, skip, take, orderBy: { date: 'desc' } }),
  this.prisma.transaction.count({ where }),
]);
```

### The response envelope

We return `data` and `meta` so the client has everything to render pagination controls:

```typescript
return {
  data: transactions,
  meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
};
```

- `totalPages = Math.ceil(total / limit)` — 47 rows with limit 20 → 3 pages.
- `page` and `limit` are echoed back so the client doesn't have to guess what was used.

### Where the page params come from

The query DTO (`src/modules/transactions/dto/transaction-query.dto.ts`) validates them:

```typescript
@IsOptional() @Type(() => Number) @IsInt() @Min(1)
page?: number = 1;

@IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
limit?: number = 20;
```

- `@Type(() => Number)` converts the URL **string** (`?page=2`) into a number.
- `@Min(1)` blocks page 0 / negative values.
- `@Max(100)` caps page size so a client can't request 1M rows.
- Defaults (`= 1`, `= 20`) kick in because the global `ValidationPipe` has `transform: true`.

## Project Example

From `findAll` in `src/modules/transactions/transactions.service.ts`:

```typescript
async findAll(userId: string, query: TransactionQueryDto) {
  const where: Prisma.TransactionWhereInput = { userId, isDeleted: false };

  if (query.accountId) where.accountId = query.accountId;
  if (query.type) where.type = query.type;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.startDate || query.endDate) {
    where.date = {};
    if (query.startDate) where.date.gte = query.startDate;
    if (query.endDate) where.date.lte = query.endDate;
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

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
}
```

Note the `where` object is built up conditionally, then **reused** by both `findMany` and `count` — the count always reflects the same filters as the page.

## Best Practices

- **Reuse one `where` object** for both `findMany` and `count` — otherwise the count silently disagrees with the data.
- **Validate page/limit in the DTO** (`@IsInt`, `@Min(1)`, `@Max(100)`), not ad-hoc in the service.
- **Echo `page` and `limit` back in `meta`** — clients often need the applied values.
- **Add a stable `orderBy`** (e.g. `date: 'desc'`) — offset pagination without a deterministic order shuffles rows between pages.
- **Always scope the listing to the user** (`userId`, `isDeleted: false`) — the same `where` is the security boundary.

## Tradeoffs

| Approach | Pros | Cons | Why we chose it |
| -------- | ---- | ---- | ---------------- |
| Offset pagination (skip/take) | Simple, supports arbitrary "jump to page N", easy total count | O(n) slow-down on deep pages; pages can shift if rows are inserted between requests | Right fit for a finance list with predictable page counts |
| Cursor pagination (where: { id > cursor }) | O(1) on deep pages; stable under inserts | No "jump to page 50"; more complex; cursor must be opaque to client | Would matter at millions of rows / infinite scroll — can revisit |
| Keyset (date + id composite) | Stable ordering under inserts | More complex where clause | Not needed at current scale |

## Pitfalls

- **`findMany` and `count` in the same transaction hold a connection longer.** For read-only listings we deliberately use `Promise.all` instead of `prisma.$transaction([...])` — see `prisma-batch-vs-promiseall.md`.
- **Missing `@Type(() => Number)`** — query params arrive as strings; `page * limit` would concatenate instead of multiply.
- **Page 0 or negative pages** — without `@Min(1)`, `skip` goes negative and Prisma throws.
- **No `orderBy`** — row order is not guaranteed, so consecutive pages may repeat or skip rows.
- **Forgetting `isDeleted: false`** in the where means soft-deleted rows leak into the listing and the balance-corrected totals.

## Key Points

- Offset pagination: `skip = (page - 1) * limit`, `take = limit`
- A separate `count` (same `where`, no skip/take) provides `total` and `totalPages`
- Run `findMany` + `count` in parallel with `Promise.all`
- Response shape: `{ data: [...], meta: { total, page, limit, totalPages } }`
- Validate and transform query params in the DTO (`@Type(() => Number)`, `@Min`, `@Max`)
- Always pair pagination with a stable `orderBy` and a user-scoped `where`
