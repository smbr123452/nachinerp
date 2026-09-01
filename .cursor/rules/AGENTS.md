# Project Instructions

Internal ERP-lite for a bakery / coffee / food production company.
Single company, single main inventory. Application lives in `apps/web`.

## Stack
- Next.js (App Router)
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- Zod

## Rules
- Plan before coding
- Keep modules separate; business logic lives in `src/server/services/`, not in components
- Use Mongolian UI
- Every inventory change creates an InventoryMovement
- Every money change creates a MoneyTransaction
- Every important action writes an AuditLog
- Financial records are cancelled/reversed, never deleted
- Critical operations run in a single database transaction
- Enforce permissions on the server, never only in the UI
- Do not break existing code

## Roles
- OWNER — sees everything, manages users, settings, expense categories, money adjustments
- MANAGER — day-to-day operations (materials, products, recipes, purchases, sales,
  expenses, counts, bank deposits); cannot delete financial history

## Core modules
- Users and roles
- Raw materials and inventory ledger
- Products and recipes (BOM)
- Purchases with weighted average costing
- Daily sales with automatic recipe consumption and COGS
- Expenses
- Cash / bank money ledger
- Inventory counts
- Reports and audit log

See `apps/web/README.md` for the full invariants and setup.
