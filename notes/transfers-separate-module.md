# Why Transfers Live in Their Own Internal Module

## Why did we need this?

After reworking the schema to double-entry transfers, we faced a placement
question: **where should the transfer logic live?**

- Transfers have **no user-facing endpoints** — users interact with their
  transaction list, not with a `/transfers` route.
- Yet transfer creation *does* create `Transaction` rows (two legs) and moves
  account balances — the same "domain" as the transactions service.

That overlap made us ask: *"is it really necessary to have a separate transfers
service, or should transfer logic just be internal methods inside
`TransactionsService`?"* The knee-jerk answer ("fewer files, reuse the balance
helpers") is real, but it trades away something important. This note records why
we kept them separate and what each option costs from a software-engineering
point of view.

## How does it work?

The decision, concretely:

- `src/modules/transfers/` — `TransfersService` (`create`, `findAll`,
  `findOne`) + `CreateTransferDto`. **No controller.** The module `exports`
  `TransfersService` so other internal modules and future queue workers can
  inject it.
- `src/modules/transactions/` — will be refactored to handle **only income and
  expense** for the current user, and will expose the user-facing CRUD
  endpoints. Transfer legs still appear in a user's transaction list because
  each leg stores its owner's `userId` — but the transactions service does not
  create or manage them.

```typescript
// transfers.module.ts
@Module({
  providers: [TransfersService],
  exports: [TransfersService], // injectable by internal consumers, no controller
})
export class TransfersModule {}
```

The key insight is that this is **not** a "premature abstraction". The two
services are being split apart for *different reasons to change*:

| Service | Reason to change | Surface |
|---------|------------------|---------|
| `TransactionsService` | income/expense CRUD rules, listing, filters | public HTTP endpoints |
| `TransfersService` | transfer lifecycle, status transitions, reconciliation, queue processing | internal DI only |

These are different enough that a change to one (e.g. adding a `direction`
filter to the transactions list) should never force a change to the other.

## Project Example

`TransfersService.create` owns the double-entry invariant end-to-end — validate
both parties, create the `Transfer`, create **both** legs, apply **both**
balance changes, all in one atomic transaction:

```typescript
async create(userId: string, dto: CreateTransferDto) {
  return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (dto.toUserId === userId) throw new HttpException('Cannot transfer to yourself', HttpStatus.BAD_REQUEST);
    if (dto.fromAccountId === dto.toAccountId) throw new HttpException('Source and destination accounts must be different', HttpStatus.BAD_REQUEST);

    // validate sender account (owned by userId), recipient user, recipient account (owned by toUserId)

    const transfer = await tx.transfer.create({
      data: { fromUserId: userId, toUserId: dto.toUserId, memo: dto.memo, status: TransferStatus.COMPLETED },
    });

    await tx.transaction.createMany({
      data: [
        { accountId: dto.fromAccountId, userId, categoryId: null, transferId: transfer.id, type: TRANSFER, direction: OUT, amount: dto.amount, date: dto.date },
        { accountId: dto.toAccountId, userId: dto.toUserId, categoryId: null, transferId: transfer.id, type: TRANSFER, direction: IN, amount: dto.amount, date: dto.date },
      ],
    });

    await tx.account.update({ where: { id: dto.fromAccountId }, data: { balance: { decrement: dto.amount } } });
    await tx.account.update({ where: { id: dto.toAccountId }, data: { balance: { increment: dto.amount } } });

    return tx.transfer.findFirst({ where: { id: transfer.id }, include: { legs: true } });
  });
}
```

The invariant — "a transfer is always two legs, always balanced" — lives in one
place, owned by the service that understands transfers. `TransactionsService`
never has to reason about it.

## Best Practices

- **Let the module that owns the invariant also own the code.** Double-entry
  integrity, cross-user validation, and future cancellation logic belong in the
  transfers service, not spread across a general-purpose service.
- **Public surface and internal surface are different teams.** Code that will
  face HTTP routes and code that will be called by workers/internal features
  have different lifetimes, tests, and failure modes. Separate them.
- **Export the service, not a controller.** `exports: [TransfersService]`
  makes it injectable without exposing an API. A future "send money to contact"
  feature adds its own controller that calls `TransfersService` — the seam is
  already there.
- **Keep the dependency one-directional.** `TransfersService` writes
  `Transaction` rows via `PrismaService` directly. It must **not** import
  `TransactionsService` (and vice versa). Shared helpers should be extracted to
  a neutral place (e.g. `src/common/` or a shared service), never a
  cross-module import that can become circular.
- **Reuse via extraction, not via nesting.** The one real overlap is balance
  application. With the new schema it collapses to "per leg: `IN` increments,
  `OUT` decrements" — a single `applyLegBalance(tx, { accountId, direction, amount })`
  helper serves both services. Extract that; don't merge the services.

## Tradeoffs

### Option A: Separate internal transfers module (chosen)

| Pros (SWE) | Cons |
| --- | --- |
| Single Responsibility: each service has one clear reason to change | One more module to navigate |
| Owns the double-entry invariant (two legs always together) | Minor duplication of balance logic unless extracted |
| Clean seam for the future status workflow + BullMQ worker | — |
| Focused unit tests: transfer invariants tested in isolation | — |
| Transactions service never has to guard against its own legs | — |

### Option B: Transfer logic as internal methods inside TransactionsService

| Pros (SWE) | Cons |
| --- | --- |
| Reuses balance helpers directly (no extraction needed today) | Transactions service grows to "big service" — SRP erosion |
| Fewer files, simpler DI graph for the MVP | `update`/`remove` must guard `transferId !== null` against *itself* |
| — | Status workflow, scheduling, reconciliation bloat a public-facing service |
| — | Queue worker would call "internal methods on a big service" — fuzzy seam |
| — | Harder to test transfer invariants without exercising the whole service |

### Should transfers ever get endpoints?

No, not for the MVP. If a product feature later needs user-initiated transfers,
the right move is a new feature controller that injects `TransfersService` —
not adding routes to the transfers module retroactively.

## Pitfalls

- **The "fewer files" trap.** Folding transfers into `TransactionsService` to
  reuse two small helper methods saves ~50 lines today and costs you a clear
  boundary for the status/queue work that is already on the roadmap.
- **Don't let `TransactionsService.update/remove` touch transfer legs.**
  Whether transfers are a separate module or not, transaction mutation must
  reject legs (`transferId !== null`). Keeping transfers separate makes that
  guard natural instead of self-defensive.
- **Avoid circular imports.** If both services need shared balance logic, put
  it in a neutral helper. `transfers → transactions` (or the reverse) imports
  will eventually bite you.
- **Don't over-justify with hypothetical features.** The split is justified by
  *concrete* facts: transfers are cross-user, have their own entity/status
  lifecycle, and have no endpoints. That's enough — you don't need to invent
  more reasons.

## Key Points

- Transfers are kept in a separate, **controller-less, exported** `TransfersService`; transactions stays income/expense-focused
- The services split on *different reasons to change*, not on code size
- A dedicated service owns the double-entry invariant: both legs created/reversed atomically
- Public-facing services and internal plumbing have different lifetimes and should not share a class
- `exports: [TransfersService]` keeps the module injectable without exposing endpoints
- Shared balance logic should be extracted to a helper, not shared via cross-module imports
- Future status workflow (PENDING/COMPLETED/FAILED) and BullMQ workers will call the transfers service as a named dependency
