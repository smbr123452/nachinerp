import "server-only";
import type { Account } from "@prisma/client";
import { d, money } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { recordMoneyTransaction } from "./money";

/**
 * "Бусад зардал" — нөөцөд НӨЛӨӨЛӨХГҮЙ зардал.
 * Бараа материалын худалдан авалт нь тусдаа модуль (Худалдан авалт).
 */
export async function postExpense(params: {
  date: Date;
  categoryId: string;
  amount: string | number;
  account: Account;
  description?: string | null;
  receiptUrl?: string | null;
  userId: string;
  ipAddress?: string | null;
}): Promise<{ id: string }> {
  const amount = money(params.amount);
  if (amount.lessThanOrEqualTo(0)) throw new Error("Зардлын дүн 0-ээс их байх ёстой.");

  return prisma.$transaction(async (tx) => {
    const category = await tx.expenseCategory.findUnique({ where: { id: params.categoryId } });
    if (!category) throw new Error("Зардлын ангилал олдсонгүй.");

    const expense = await tx.expense.create({
      data: {
        date: params.date,
        categoryId: params.categoryId,
        amount,
        account: params.account,
        description: params.description ?? null,
        receiptUrl: params.receiptUrl ?? null,
        status: "POSTED",
        createdById: params.userId,
      },
      select: { id: true },
    });

    await recordMoneyTransaction(tx, {
      type: "EXPENSE_OUT",
      amount,
      sourceAccount: params.account,
      referenceType: "EXPENSE",
      referenceId: expense.id,
      note: category.name,
      userId: params.userId,
      occurredAt: params.date,
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "EXPENSE_CREATED",
        entityType: "Expense",
        entityId: expense.id,
        newValue: { amount: amount.toString(), category: category.name, account: params.account },
        ipAddress: params.ipAddress,
      },
      tx,
    );

    return expense;
  });
}

export async function cancelExpense(params: {
  expenseId: string;
  userId: string;
  note: string;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findUnique({ where: { id: params.expenseId } });
    if (!expense) throw new Error("Зардал олдсонгүй.");
    if (expense.status !== "POSTED") throw new Error("Зөвхөн батлагдсан зардлыг цуцална.");

    await recordMoneyTransaction(tx, {
      type: "OTHER_IN",
      amount: expense.amount,
      destinationAccount: expense.account,
      referenceType: "EXPENSE_CANCEL",
      referenceId: expense.id,
      note: "Зардлын цуцлалт",
      userId: params.userId,
    });

    await tx.expense.update({
      where: { id: expense.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelNote: params.note },
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "EXPENSE_CANCELLED",
        entityType: "Expense",
        entityId: expense.id,
        oldValue: { status: expense.status, amount: d(expense.amount).toString() },
        newValue: { status: "CANCELLED" },
        note: params.note,
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}
