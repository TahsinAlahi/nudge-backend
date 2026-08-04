# Transaction Modeling

> **Update:** this note documents the *original* single-row approach. We replaced
> it with **double-entry** because inter-user transfers need two users per
> transfer. See [transaction-double-entry.md](transaction-double-entry.md) for
> the current model, and [single-row-transaction-model.md](single-row-transaction-model.md)
> for when the single-row shape is still a valid choice.

## Why did we need this?

When building a finance app, the most fundamental operation is recording a
transaction. But a transaction can mean different things:
- **Income** — money arrives (salary, gift)
- **Expense** — money leaves (coffee, rent)
- **Transfer** — money moves between your own accounts

The challenge: how do you model all three in a single table without making the
schema confusing or forcing bad data?

---

## How does it work?

### The key insight: one account is always involved

Every financial event happens to an account:
- Income goes **into** an account
- Expense comes **out of** an account
- Transfer moves money **from** one account **to** another

So every transaction has a **primary account** (`accountId`). The `type` field
tells you the direction. The `fromAccountId` is only needed for transfers.

### The three cases

| Type | accountId | fromAccountId | What happened |
|------|-----------|---------------|---------------|
| INCOME | Your savings account | null | Salary deposited |
| EXPENSE | Your wallet | null | Bought coffee |
| TRANSFER | Destination account | Source account | Moved money to savings |

### Why not name it "toAccount"?

Earlier versions of this schema used `transactionsTo` as the relation name.
This was misleading — an expense doesn't send money *to* the spending account.
The money leaves it.

The fix was to use a **neutral** relation name:

```prisma
// On Account
transactions      Transaction[] @relation("accountTransactions")
outgoingTransfers Transaction[] @relation("transferSource")

// On Transaction
accountId     String
account       Account  @relation(name: "accountTransactions", ...)
fromAccountId String?
fromAccount   Account? @relation(name: "transferSource", ...)
```

Now the relation names don't imply direction. The `type` enum handles that.

---

## Project Example

From `prisma/schema.prisma`:

```prisma
model Transaction {
  id            String   @id @default(uuid(7))
  accountId     String
  account       Account  @relation(name: "accountTransactions", fields: [accountId], references: [id], onUpdate: Cascade)
  fromAccountId String?
  fromAccount   Account? @relation(name: "transferSource", fields: [fromAccountId], references: [id], onUpdate: Cascade)
  userId        String
  user          User     @relation(fields: [userId], references: [id], onUpdate: Cascade)
  categoryId    String
  category      Category @relation(fields: [categoryId], references: [id], onUpdate: Cascade)

  type      TransactionType
  amount    Decimal         @db.Decimal(12, 2)
  note      String?
  date      DateTime
  isDeleted Boolean         @default(false)
}
```

Creating records:

```typescript
// Income — $1000 salary to checking account
prisma.transaction.create({
  data: { accountId: checkingId, userId, categoryId, type: 'INCOME', amount: 1000, date: new Date() }
})

// Expense — $5 coffee from wallet
prisma.transaction.create({
  data: { accountId: walletId, userId, categoryId, type: 'EXPENSE', amount: 5, date: new Date() }
})

// Transfer — moved $200 from checking to savings
prisma.transaction.create({
  data: { accountId: savingsId, fromAccountId: checkingId, userId, type: 'TRANSFER', amount: 200, date: new Date() }
})
```

---

## Best Practices

- **Use neutral relation names** — avoid `toAccount` or `fromAccount` for the
  primary account field. Direction should come from the `type` enum, not from
  field names.
- **Keep `fromAccountId` optional** — it's null for 90%+ of transactions
  (income and expense). Only set it for transfers.
- **Required `accountId`** — every transaction must affect at least one
  account. This guarantees data integrity.
- **Store `userId` on the transaction** — even though you could derive it
  through `account.userId`. This lets you query `WHERE userId = ?` directly
  without joining through Account.

---

## Tradeoffs

| Approach | Pros | Cons |
|----------|------|------|
| Two columns (accountId + fromAccountId) | Single table, simple queries | fromAccountId is null for most rows |
| Separate income/expense/transfer tables | Clean per-type schema | Complex queries, union all, harder reporting |
| One account column + sign (negative = expense) | Fewer columns | Sign confusion, harder to filter by type |

**Why we chose two columns:** One table for everything keeps queries simple and
reporting straightforward. The nullable `fromAccountId` is a small price for
not having to UNION three separate tables.

---

## Pitfalls

- **Don't name it `toAccount`** — we made this mistake. It's confusing for
  expenses where money leaves, not arrives.
- **Don't omit `userId`** on transaction — you'll regret the JOIN overhead
  when querying "all of my transactions."
- **`onDelete: SetDefault` on categoryId is tricky** — if you use it, you must
  have a default category in the DB or the delete will fail.

---

## Key Points

- Every transaction has one **primary account** (`accountId`), plus an
  optional **source account** (`fromAccountId`) for transfers
- The `type` enum (INCOME/EXPENSE/TRANSFER) determines direction, not the
  field name
- Relation names should be neutral — `accountTransactions` not `transactionsTo`
- `userId` is denormalized on Transaction for query performance
- Three transaction types, one table, clean schema

---

## References

- [Prisma Relations](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations)
