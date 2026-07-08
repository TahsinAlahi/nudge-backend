# Nudge - Backend MVP Todo

## Phase 0: Project Setup

- [x] Initialize NestJS project
- [x] Configure TypeScript path aliases
- [x] Set up ESLint + Prettier
- [x] Configure environment variables
- [x] Create Dockerfile
- [x] Create docker-compose.yml
- [x] Run PostgreSQL in Docker
- [x] Add health check endpoint
- [x] Configure global exception filter
- [x] Configure request validation (class-validator)
- [x] Configure API versioning
- [x] Configure logging system
- [x] Create project folder structure

---

## Phase 1: Database & Infrastructure

- [x] Install and configure Prisma ORM
- [x] Set up PostgreSQL connection
- [x] Create initial migration
- [x] Implement PrismaService (wraps PrismaClient for NestJS DI with PrismaPg adapter + lifecycle hooks)
- [ ] Seed development database
- [x] Configure database indexes
- [x] Configure soft delete strategy

### Core Entities

- [x] User
- [x] Account
- [x] Transaction
- [x] Category
- [x] Budget
- [x] RecurringTransaction
- [x] RefreshToken
- [ ]BudgetCategory (removed from schema - not seemed to be useful right now)

---

## Phase 2: Authentication

### User Management

- [x] Register user (with duplicate email check, Prisma select to exclude password)
- [x] Login user (validates credentials, returns JWT access token)
- [x] Refresh token flow (opaque token, SHA-256 hashed before storage, rotation with Prisma transaction)
- [x] Logout user (revoke specific refresh token)

### Security

- [x] Password hashing (bcrypt, 10 rounds)
- [x] JWT access token (JwtModule with registerAsync + ConfigService factory)
- [x] JWT refresh token (RefreshToken model + schema done)
- [x] Route guards (JwtAuthGuard + JwtStrategy with Prisma user lookup + soft-delete check)
- [ ] Role-based authorization

### User Features

- [x] Get profile (JwtStrategy returns user data, controller endpoint implemented)
- [ ] Update profile
- [ ] Change password

---

## Phase 3: Account Management

### Accounts

- [x] Create account (POST /accounts, validated DTO with AccountType enum)
- [x] Update account (PATCH /accounts/:id, name/type/currency only)
- [x] Delete account (soft-delete with isDeleted + deletedAt)
- [x] Get account details (GET /accounts/:id, ownership enforced)
- [x] Get all user accounts (GET /accounts, filtered by userId)

### Account Types (enums defined in schema)

- [x] Cash
- [x] Bank
- [x] Mobile Banking
- [x] Credit Card

### Balance

- [x] Current balance (returned as part of account CRUD, balance field on Account model)
- [x] Total net worth (can be derived from sum of all account balances)

---

## Phase 4: Categories

### Category CRUD

- [x] Create category (POST /categories, validated DTO with TransactionType enum)
- [x] Update category (PATCH /categories/:id, user-owned only, global categories are read-only)
- [x] Delete category (soft-delete, user-owned only)
- [x] Get categories (GET /categories, returns user's own + global categories)

### Category Types

- [x] Income categories (filter by type via findAll)
- [x] Expense categories (filter by type via findAll)

### Defaults

- [ ] Seed default categories

---

## Phase 5: Transactions

### CRUD

- [ ] Create transaction
- [ ] Update transaction
- [ ] Delete transaction
- [ ] Get transaction
- [ ] Get transaction list

### Transaction Types (enums defined in schema)

- [x] Income
- [x] Expense
- [x] Transfer

### Features

- [ ] Attach notes
- [ ] Transaction tags
- [ ] Pagination
- [ ] Sorting
- [ ] Filtering by account
- [ ] Filtering by category
- [ ] Filtering by date
- [ ] Filtering by amount range

### Validation

- [ ] Prevent invalid transfers
- [ ] Validate account ownership
- [ ] Validate balances

---

## Phase 6: Budgets

### Budget CRUD

- [ ] Create budget
- [ ] Update budget
- [ ] Delete budget
- [ ] Get budget

### Budget Features

- [ ] Monthly budgets (Budget model done at schema level)
- [ ] Category budgets (BudgetCategory is removed for now )
- [ ] Budget usage tracking
- [ ] Remaining budget calculation

### Alerts

- [ ] 80% budget usage warning
- [ ] Budget exceeded warning

---

## Phase 7: Dashboard & Analytics

### Dashboard

- [ ] Total income
- [ ] Total expenses
- [ ] Net savings
- [ ] Account balances

### Reports

- [ ] Monthly summary
- [ ] Weekly summary
- [ ] Expense by category
- [ ] Income by category

### Charts API

- [ ] Spending trend
- [ ] Income trend
- [ ] Savings trend

---

## Phase 8: Search & Filtering

- [ ] Global transaction search
- [ ] Search by notes
- [ ] Search by category
- [ ] Search by amount
- [ ] Search by date range

---

## Phase 9: Recurring Transactions

### CRUD (RecurringTransaction model + enums done at schema level)

- [ ] Create recurring transaction
- [ ] Update recurring transaction
- [ ] Delete recurring transaction

### Scheduling (RecurringFrequency enum in schema: DAILY, WEEKLY, MONTHLY, YEARLY)

- [x] Daily recurrence
- [x] Weekly recurrence
- [x] Monthly recurrence
- [x] Yearly recurrence

### Automation

- [ ] Auto-create transactions

---

## Phase 10: Notifications

### Notification System

- [ ] Budget alerts
- [ ] Recurring payment reminders
- [ ] Upcoming bill reminders

### Infrastructure

- [ ] Notification entity
- [ ] Read/unread status
- [x] RefreshToken entity

---

# Recommended MVP Finish Line

At this point you should have:

- [x] Authentication (register, login, refresh, logout, profile + JWT guard)
- [x] Accounts (CRUD with ownership enforcement + soft-delete)
- [x] Categories (CRUD with ownership enforcement + global category support)
- [ ] Transactions
- [ ] Budgets
- [ ] Dashboard analytics
- [ ] Recurring transactions
- [ ] Notifications

---

# Phase 11: Backend Upgrades

## Redis

- [ ] Add Redis
- [ ] Cache dashboard statistics
- [ ] Cache reports
- [ ] Cache user profile

## Background Jobs

- [ ] Install BullMQ
- [ ] Create queue module
- [ ] Recurring transaction worker
- [ ] Notification worker

---

# Phase 12: Advanced Finance Features

## Rules Engine

- [ ] Auto-categorization rules
- [ ] Merchant matching rules
- [ ] Custom automation rules

### Example Rules

- [ ] "Salary" → Income
- [ ] "FoodPanda" → Food
- [ ] "Bkash Cash Out" → Fees

---

## Financial Health Score

- [ ] Savings score
- [ ] Budget score
- [ ] Spending score
- [ ] Overall financial score

---

## Goal Tracking

- [ ] Create saving goal
- [ ] Goal progress
- [ ] Goal completion

---

# Phase 13: Production Readiness

- [ ] Swagger documentation
- [ ] Rate limiting
- [ ] Helmet security
- [ ] CORS configuration
- [ ] Audit logging
- [ ] Docker production setup
- [ ] CI/CD pipeline
- [ ] Automated tests
- [ ] API monitoring
- [ ] Error tracking

---

# Nice-to-Have (After MVP)

- [ ] CSV import
- [ ] OCR receipt scanning
- [ ] AI spending insights
- [ ] Subscription detection
- [ ] Family/shared wallets
- [ ] Multi-currency support
- [ ] Investment tracking
- [ ] Forecasting engine
- [ ] Double-entry accounting ledger
