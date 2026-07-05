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
- [ ] Refresh token flow (RefreshToken model ready, endpoint not implemented)
- [ ] Logout user

### Security

- [x] Password hashing (bcrypt, 10 rounds)
- [x] JWT access token (JwtModule with registerAsync + ConfigService factory)
- [x] JWT refresh token (RefreshToken model + schema done)
- [x] Route guards (JwtAuthGuard + JwtStrategy with Prisma user lookup + soft-delete check)
- [ ] Role-based authorization

### User Features

- [ ] Get profile (JwtStrategy returns user data, controller endpoint pending)
- [ ] Update profile
- [ ] Change password

---

## Phase 3: Account Management

### Accounts

- [ ] Create account
- [ ] Update account
- [ ] Delete account
- [ ] Get account details
- [ ] Get all user accounts

### Account Types (enums defined in schema)

- [x] Cash
- [x] Bank
- [x] Mobile Banking
- [x] Credit Card

### Balance

- [ ] Calculate current balance
- [ ] Calculate total net worth

---

## Phase 4: Categories

### Category CRUD

- [ ] Create category
- [ ] Update category
- [ ] Delete category
- [ ] Get categories

### Category Types

- [ ] Income categories
- [ ] Expense categories

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

- [ ] Authentication (register + login + guard done; refresh, logout, profile pending)
- [ ] Accounts
- [ ] Categories
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
