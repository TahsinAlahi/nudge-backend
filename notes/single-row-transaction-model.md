# Single-Row Transaction Models: When One Row Per Transfer Is Fine

## Why did we need this?

The first version of our `Transaction` table used a single-row model. We later
replaced it with double-entry (see
[transaction-double-entry.md](transaction-double-entry.md)) because inter-user
transfers are planned. Before throwing it away, it's worth understanding **why
the single-row model was tempting, when it's genuinely fine, and exactly where
it breaks** — so future us can pick the right shape without re-deriving it.

## How does it work?

The single-row model records one financial event as one row. It needs a primary
account plus, for transfers, an optional second account:

```prisma
accountId     String          // the account this transaction is "about"
fromAccountId String?         // the source account, only set for TRANSFER rows
type          TransactionType // INCOME | EXPENSE | TRANSFER
amount        Decimal
userId        String
```

The `type` enum carries the direction; the second column is only ever used by
transfers:

| Type | accountId | fromAccountId | Effect |
|------|-----------|---------------|--------|
| INCOME | destination | null | `balance += amount` |
| EXPENSE | spending account | null | `balance -= amount` |
| TRANSFER | destination | source | `source -=`, `destination +=` |

The three cases reuse one table, one query pattern, and one CRUD code path.

## When to use it (use cases)

- **Transfers are only ever between your own accounts** — moving money from
  checking to savings, for example. Both accounts share one owner, so a single
  `userId` on the row is unambiguous.
- **You're building an MVP / prototype** and inter-user money movement is a
  "maybe later". Single-row CRUD is the fastest thing to ship.
- **Reads dominate and are simple** — "list my transactions" is a direct
  `WHERE userId = ?` on one table, with no leg joining or `transferId`
  grouping.
- **You don't need double-entry accounting semantics** (not building a ledger
  or a bank-style system).

## Project Example

The original schema (now removed from `prisma/schema.prisma`):

```prisma
model Transaction {
  accountId     String
  account       Account  @relation(name: "accountTransactions", ...)
  fromAccountId String?
  fromAccount   Account? @relation(name: "transferSource", ...)
  userId        String
  type          TransactionType
  amount        Decimal
}
```

Creating a same-user transfer ($200 checking → savings):

```typescript
await prisma.transaction.create({
  data: {
    accountId: savingsId,
    fromAccountId: checkingId,
    userId,
    type: 'TRANSFER',
    amount: 200,
    date: new Date(),
  },
});
```

## Pros and Cons

| Aspect | Pros | Cons |
| ------ | ---- | ---- |
| Simplicity | One table, one row per event, one CRUD path | Transfer's direction lives across two columns (`accountId` + `fromAccountId`) |
| Reads | "My transactions" = `WHERE userId = ?` | "Account X's transactions" needs `accountId = X OR fromAccountId = X` |
| Storage | — | `fromAccountId` is null for 90%+ of rows |
| Inter-user | — | A single `userId` cannot represent two parties — breaks completely |
| Balance | — | A transfer updates two accounts from one row, so balance code branches on `type` and touches both columns |

## When NOT to use it

- **Inter-user transfers** — one row has no place for the second user's id, and
  adding a second nullable `userId` column just kicks the problem down the road.
- **When an account's balance/ledger must be derivable from its own rows alone**
  — single-row needs to look at both the primary and source columns.
- **When transfers are queried from either side** (source or destination) and
  you don't want `OR` in every account query.

## Best Practices (if you do use it)

- Treat `type` as the single source of truth for direction; keep relation names
  neutral (no `toAccount` — an expense doesn't send money *to* the account).
- Enforce "both accounts belong to the requesting user" in the service layer —
  the schema alone can't prevent cross-user transfers.
- Treat same-user-only as a deliberate constraint, not a shortcut: document it,
  because the schema gives you no protection against a future inter-user
  transfer being stored.

## Key Points

- Single-row works when transfers are same-user-only and reads are simple.
- `type` carries direction; `fromAccountId` is the nullable second half of a
  transfer.
- It breaks the moment a transfer has two owners — one `userId` can't hold both.
- Account-scoped queries and balance math both need `OR` / type-branching.
- We switched to double-entry because inter-user transfers are core — not
  because single-row is never a valid choice.
