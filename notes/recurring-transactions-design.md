# Recurring Transactions: Scope & Design

## Why did we need this?

A finance app needs to handle subscriptions and regular payments. Without a
dedicated model, users would have to manually enter Netflix, Spotify, or rent
every single month. The goal: let the user define a repeating transaction once,
and optionally auto-create it on schedule.

But the first question isn't *how* — it's **what counts as recurring?**

---

## Narrow vs Broad: What belongs in RecurringTransaction?

### Broad scope (everything repetitive)

```
RecurringTransaction = anything that repeats
├── Subscriptions (Netflix $15/mo)          → fixed amount ✓
├── Bills (rent $1500/mo)                   → fixed amount ✓
└── Daily coffee ($4 variable)              → variable amount ✗
```

**Problem:** habits like daily coffee or weekly groceries have **variable
amounts** ($4 today, $6 tomorrow). If you auto-create a $0 placeholder, the
user still has to edit the amount each time — defeating the purpose.

### Narrow scope (fixed, predictable only)

```
RecurringTransaction = predictable fixed-amount obligations
├── Subscriptions (Netflix, Spotify, iCloud)
├── Bills (rent, insurance, utility installments)
└── NOT daily habits (amount varies too much)
```

**Why narrow is better for MVP:**
- Auto-creation works without friction (amount is known)
- Users understand it intuitively
- Variable habits can be added later with an "estimate + reminder" pattern

---

## The accountId question

A recurring transaction needs to know **which account** the money comes from.
But what if the user deletes that account later?

### Option A: Required accountId + Restrict

```prisma
accountId String
account   Account @relation(fields: [accountId], references: [id], onDelete: Restrict)
```
Transaction history is safe (transactions aren't deleted), but the user can't
delete the account until they reassign or delete all recurring transactions
linked to it.

### Option B: Required accountId + Cascade

```prisma
onDelete: Cascade
```
Deleting the account deletes the recurring transaction. The history of past
transactions survives (they reference the account separately), but the
recurring definition is gone.

### Option C: Optional accountId + SetNull (what we chose)

```prisma
accountId String?
account   Account? @relation(fields: [accountId], references: [id], onDelete: SetNull, onUpdate: Cascade)
```

- While the account exists → auto-creation knows where to go ✓
- If the user deletes the account → field goes null, record survives ✓
- Auto-creation detects null → skips or warns user to reassign ✓

---

## Project Example

From `prisma/schema.prisma`:

```prisma
model RecurringTransaction {
  id         String   @id @default(uuid(7))
  userId     String
  user       User     @relation(fields: [userId], references: [id], onUpdate: Cascade)
  accountId  String?
  account    Account? @relation(fields: [accountId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id], onUpdate: Cascade)

  amount            Decimal            @db.Decimal(12, 2)
  note              String?
  frequency         RecurringFrequency
  startDate         DateTime
  endDate           DateTime?
  nextExecutionDate DateTime
  status            RecurringStatus    @default(ACTIVE)
  isDeleted         Boolean            @default(false)
}
```

Creating a subscription:

```typescript
prisma.recurringTransaction.create({
  data: {
    userId,
    accountId: checkingAccountId,
    categoryId: entertainmentCategoryId,
    amount: 15,
    note: 'Netflix',
    frequency: 'MONTHLY',
    startDate: new Date('2026-07-01'),
    nextExecutionDate: new Date('2026-07-01'),
  }
})
```

---

## Best Practices

- **Start narrow** — only fixed-amount subscriptions and bills. Add
  variable-amount habits later.
- **`onDelete: SetNull` on accountId** — preserves the recurring definition
  even after account deletion. The scheduler checks for null and skips.
- **Index `nextExecutionDate`** — the scheduler queries "which recurring
  transactions need to run today?" This index makes that fast.
- **Index `status`** — filter by ACTIVE to skip paused/completed ones.

---

## Tradeoffs

| Approach | Account deleted | Auto-creation | Complexity |
|----------|----------------|---------------|------------|
| Required + Restrict | User can't delete | Works | Low |
| Required + Cascade | Recurring deleted | Works | Low |
| Optional + SetNull | Survives with null account | Skips (no target) | Medium |

**Why we chose SetNull:** It's the most resilient. The user can clean up their
accounts without losing their subscription records. The auto-creation
gracefully skips null-account entries.

---

## Pitfalls

- **Don't include variable-amount habits** in RecurringTransaction for MVP.
  Users will confuse it with manual entry and neither works well.
- **`nextExecutionDate` must be updated** after each auto-creation, or the
  scheduler will fire again immediately.
- **Time zone handling** — `nextExecutionDate` is DateTime. Decide early if
  you store UTC and convert, or store user-local time.

---

## Key Points

- Narrow scope = fixed-amount predictable payments only (subscriptions, bills)
- Variable habits (daily coffee) are better as manual transactions
- `accountId` is optional with `onDelete: SetNull` — survives account deletion
- Scheduler queries `nextExecutionDate` + `status: ACTIVE` to find what to run
- Start simple, add complexity later

---

## References

- [Prisma onDelete reference](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/referential-actions)
