# Double-Entry Transfers: A Transfer Is Two Rows

## Why did we need this?

Our original `Transaction` model recorded one event as one row:

```prisma
accountId     String
fromAccountId String?   // source account, only set for transfers
userId        String
```

That felt wrong the moment we thought about it: *if every transaction stores a
single `userId`, then a transfer between two users needs both the sender's and
the receiver's id in one row.* And inter-user transfers (sending money to
someone else's account) were a planned feature — so this was a real problem, not
a hypothetical one.

The realization that unlocked everything: **a transfer is not one event on one
account — it is two events**:

1. money leaves account A (an outflow)
2. money arrives at account B (an inflow)

You can't faithfully cram both into a single row without nullable columns, two
user ids, or ambiguous balance math. So we stopped trying.

## How does it work?

Double-entry splits a transfer into **two `Transaction` rows (legs)**. Each leg:

- belongs to exactly **one account** (`accountId`)
- belongs to exactly **one user** (`userId`) — so there is never a two-user row
- carries a **`direction`** (`IN` / `OUT`) saying which way the money moved
- shares a **`transferId`** with the other leg so the UI can group them back
  into one transfer

```prisma
model Transaction {
  accountId   String
  userId      String
  direction   Direction   // IN = money into accountId, OUT = money out of accountId
  transferId  String?     // null for income/expense; set on both transfer legs
  transfer    Transfer?
  type        TransactionType
  amount      Decimal
  categoryId  String?     // transfers have no meaningful category
}

model Transfer {
  id         String   @id @default(uuid(7))
  fromUserId String
  toUserId   String
  status     TransferStatus @default(COMPLETED)
  legs       Transaction[]
}
```

`Transfer` is the "one" side of a 1:N relation — one transfer, two transaction
legs. It also gives us a home for transfer-level metadata (`memo`, `status`)
that doesn't belong on either individual leg.

## Project Example

Sending $50 from your checking account to a friend's wallet:

```typescript
await prisma.$transaction(async (tx) => {
  const transfer = await tx.transfer.create({
    data: { fromUserId: senderId, toUserId: receiverId, memo: 'lunch' },
  });

  await tx.transaction.create({
    data: {
      accountId: checkingId,
      userId: senderId,
      type: 'TRANSFER',
      direction: 'OUT',
      transferId: transfer.id,
      amount: 50,
      date: new Date(),
    },
  });

  await tx.transaction.create({
    data: {
      accountId: walletId,
      userId: receiverId,
      type: 'TRANSFER',
      direction: 'IN',
      transferId: transfer.id,
      amount: 50,
      date: new Date(),
    },
  });
});
```

The old service hard-coded `fromAccount.userId !== userId` as a 404 — transfers
were same-user only. With two legs that check disappears: the sender's leg
belongs to the sender, the receiver's leg to the receiver. The requester's
`userId` scoping still works because each leg has exactly one owner.

### Why this also fixes balance math

Old model: applying a transfer meant updating **two accounts from one row**,
branching on `type` and reading both `accountId` and `fromAccountId`. Querying
"transactions for account X" needed `WHERE accountId = X OR fromAccountId = X`.

New model: every leg touches exactly one account, so the logic collapses to a
single unconditional update and a simple query:

```text
balance effect per leg:  IN  → account.balance += amount
                         OUT → account.balance -= amount
transactions for an account: SELECT * FROM transactions WHERE account_id = X
```

No `OR`, no type-branching in the balance code.

## Best Practices

- Model a transfer as two linked rows, never one row with two account columns.
- Keep `userId` denormalized on each leg — it makes "all my transactions" a
  direct `WHERE userId = ?` query with no JOIN through Account.
- Keep `amount` always positive and store the direction in an `IN`/`OUT` enum.
  Signed amounts are the true accounting standard, but the enum is more
  self-documenting and keeps DTO validation (`@Min(0.01)`) intact.
- Put transfer-level fields (`memo`, `status`) on the `Transfer` model, not on
  either leg.
- Decide leg behavior on transfer delete: we use `onDelete: Cascade` so deleting
  a `Transfer` removes both legs together.

## Tradeoffs

| Approach | Pros | Cons | Why we chose it |
| -------- | ---- | ---- | ---------------- |
| Double-entry (two legs + Transfer) | One account + one user per row; inter-user transfers work; trivial per-account balance | Transfer spans two rows; reads must group by `transferId` | Inter-user transfers are a core feature |
| Single row (`accountId` + `fromAccountId`) | One row per transfer, simplest reads | One `userId` can't hold two owners; nullable column; balance queries need `OR` | Rejected — can't represent two users |

## Pitfalls

- Don't "fix" transfers by adding a second user id (e.g. `fromUserId`) to a
  single transaction row — you get nullable columns and ambiguous semantics.
  Split the rows instead.
- Don't rely on `type` alone to know a leg's direction — a TRANSFER leg can be
  money in or money out; that's why `direction` exists.
- Remember both legs must be created/updated/deleted together, inside one
  `$transaction` — a partial transfer (one leg only) is a data corruption bug.
- If you keep `categoryId` required, transfers force a fake "Transfer" category;
  make it nullable instead.

## Key Points

- A transfer is two events (out of A, in to B), so it belongs in two rows.
- Each leg has exactly one account and one user — inter-user transfers just work.
- The `Transfer` model is the 1:N "one" side, linking the legs and holding
  transfer-level metadata like `status`.
- Balance math collapses to one unconditional update per leg; account queries
  need no `OR`.
- `userId` stays denormalized per leg for fast per-user queries.
