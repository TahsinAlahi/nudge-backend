# Transaction CRUD Service — Balance Management

## Why did we need this?

The `Transaction` model existed in the Prisma schema, but the service was an empty scaffold. The hard part isn't the CRUD — it's that **every transaction must change account balances**:

| Type | Effect on balance |
|------|-------------------|
| INCOME | destination account `balance += amount` |
| EXPENSE | source account `balance -= amount` |
| TRANSFER | source account `balance -= amount`, destination account `balance += amount` |

On top of that:
- **Updates** must undo the old transaction's effect, then apply the new one.
- **Deletes** are soft (`isDeleted = true`), so they still need to reverse the balance effect.
- A finance app cannot afford a crash halfway through — balance and transaction must change atomically.

This note captures how we structured the service to keep balance logic correct, reusable, and race-safe.

## How does it work?

### Balance mutations are wrapped in a Prisma interactive transaction

All three balance-mutating operations (`create`, `update`, `remove`) run inside `this.prisma.$transaction(async (tx) => { ... })`. If any step fails, everything rolls back — the account balance and the transaction row can never diverge.

### The apply / reverse helper pattern

Instead of scattering `balance: { increment }` / `{ decrement }` logic across methods, we extracted two private helpers:

- **`applyBalanceEffects`** — applies a transaction's effect (used by `create`, and by `update` after reversing).
- **`reverseBalanceEffects`** — undoes an existing transaction's effect (used by `update` before re-applying, and by `remove`).

```typescript
private async applyBalanceEffects(
  tx: Prisma.TransactionClient,
  type: TransactionType,
  amount: number,
  accountId: string,
  fromAccountId?: string,
) {
  if (type === TransactionType.INCOME) {
    await tx.account.update({ where: { id: accountId }, data: { balance: { increment: amount } } });
  } else if (type === TransactionType.EXPENSE) {
    await tx.account.update({ where: { id: accountId }, data: { balance: { decrement: amount } } });
  } else if (type === TransactionType.TRANSFER && fromAccountId) {
    await tx.account.update({ where: { id: fromAccountId }, data: { balance: { decrement: amount } } });
    await tx.account.update({ where: { id: accountId }, data: { balance: { increment: amount } } });
  }
}
```

`reverseBalanceEffects` is the exact mirror image (INCOME becomes decrement, EXPENSE becomes increment, TRANSFER swaps direction). The `number | Prisma.Decimal` on its param reminds us that **amounts read from the DB come back as `Prisma.Decimal`**, not `number` — hence `const amount = Number(transaction.amount);`.

### Update = reverse old + apply new

`update` never tries to "diff" balances. It unconditionally reverses the stored transaction's effect, then applies the new resolved values. This automatically handles changing `type`, `amount`, `accountId`, and `fromAccountId` in any combination — even switching a TRANSFER into an EXPENSE.

```typescript
const balanceFieldsChanged =
  dto.amount !== undefined ||
  dto.type !== undefined ||
  dto.accountId !== undefined ||
  dto.fromAccountId !== undefined;

if (balanceFieldsChanged) {
  await this.reverseBalanceEffects(tx, existing);
  await this.applyBalanceEffects(tx, newType, newAmount, newAccountId, newFromAccountId ?? undefined);
}
```

### Ownership scoping needs `findFirst`, not `findUnique`

Every query filters by `{ id, userId, isDeleted: false }`. But `prisma.transaction.findUnique` **only accepts fields covered by a unique constraint** (`id` here). To add `userId` and `isDeleted` filters, we must use `findFirst`:

```typescript
const existing = await tx.transaction.findFirst({
  where: { id, userId, isDeleted: false },
});
```

If we used `findUnique({ where: { id } })` and checked ownership manually, we'd still be safe but it's cleaner to express the scope in the `where`.

### TRANSFER invariants

`create` and `update` enforce the same three rules for TRANSFER:
1. `fromAccountId` is required.
2. Source and destination must be different accounts.
3. Both accounts must exist, not be soft-deleted, and belong to the user.

In `update`, if the resolved type is not TRANSFER, `fromAccountId` is forced to `null` — this is the "auto-clear" that prevents stale source accounts when a transfer becomes an expense.

## Project Example

Full service at `src/modules/transactions/transactions.service.ts`. The three public methods:

```typescript
async create(userId: string, dto: CreateTransactionDto) {
  return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const account = await tx.account.findUnique({ where: { id: dto.accountId } });
    if (!account || account.isDeleted || account.userId !== userId) {
      throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
    }

    // ... TRANSFER validation, category validation ...

    const transaction = await tx.transaction.create({
      data: { accountId: dto.accountId, fromAccountId: /* null unless TRANSFER */, userId, categoryId, type, amount, note, date },
      include: this.include, // account, fromAccount, category
    });

    await this.applyBalanceEffects(tx, dto.type, dto.amount, dto.accountId, dto.fromAccountId);
    return transaction;
  });
}

async remove(userId: string, id: string) {
  return this.prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findFirst({ where: { id, userId, isDeleted: false } });
    if (!transaction) throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);

    await this.reverseBalanceEffects(tx, transaction);

    return tx.transaction.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  });
}
```

The shared `include` (account, fromAccount, category) means all reads return the relations the frontend needs without repeating the shape.

## Best Practices

- **Never mutate a balance outside a transaction.** A single `prisma.transaction.create` alone is not enough — the balance update must be in the same atomic unit.
- **Reuse helpers instead of duplicating increment/decrement logic** across create/update/remove. One source of truth for the balance rules.
- **Express ownership in the `where` clause** (`id, userId, isDeleted`) so a non-owned record is indistinguishable from a missing one — no user enumeration.
- **Always `include` relations** in reads so the API returns account/category data without N+1 calls from the client.
- **Validate inside the transaction** so a failed validation rolls back any partial writes (e.g., transfer validations before creating).
- **Resolve `fromAccountId` from the new type**, not just from the DTO, so leaving TRANSFER clears the source automatically.

## Tradeoffs

| Approach | Pros | Cons | Why we chose it |
| -------- | ---- | ---- | ---------------- |
| Apply/reverse helper methods | One place to define balance rules; update = reverse + apply for free | Indirection across a few small methods | Keeps create/update/remove small and correct |
| Inline increment/decrement in each method | No abstraction | Logic duplicated 3×, easy to get direction wrong | Rejected — direction bugs are exactly what we want to avoid |
| `findFirst` with composite where | Single query enforces ownership | `findFirst` reads slightly less "unique" than `findUnique` | Required — `findUnique` can't filter non-unique fields |
| Manual ownership check after `findUnique` | `findUnique` by id | Two-step logic, returns confusing 404 vs 403 | Rejected — scope in `where` is simpler |

## Pitfalls

- **`findUnique` only filters unique fields.** `{ id, userId }` won't compile with `findUnique` — use `findFirst` (we hit this immediately when writing `findOne`).
- **Prisma returns `Decimal` for money fields.** `existing.amount` is a `Prisma.Decimal`, not `number`. Pass it through `Number()` before arithmetic/updates.
- **Forgetting `fromAccountId` auto-clear.** If an update changes TRANSFER → EXPENSE but leaves `fromAccountId` set, the data is inconsistent and future balance reversals read a stale source.
- **Transactions are not a substitute for balance checks.** We don't prevent an EXPENSE from driving a balance negative here — that's a separate business rule.
- **Never mix `this.prisma` and `tx` inside the same transaction.** Queries on `this.prisma` bypass the transaction. (Also see `prisma-transactions.md`.)

## Key Points

- Balance integrity is the core job of the transaction service; every mutation is atomic via `prisma.$transaction`
- INCOME adds, EXPENSE subtracts, TRANSFER subtracts source + adds destination
- `update` = reverse old effects, then apply new effects — handles any field combination for free
- Soft delete (`remove`) still reverses the balance — deleting is not free of side effects
- Ownership + soft-delete filtering lives in the `where`, which requires `findFirst` (not `findUnique`)
- Decimal → `Number()` conversion is required when reading amounts back from the DB
- TRANSFER invariants (source required, distinct, owned) are enforced identically in create and update
