import "server-only";
import { Account, type MoneyTransactionType } from "@prisma/client";
import { d, money, ZERO, type Dec, type DecimalLike } from "@/lib/decimal";
import type { Tx } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Мөнгөний ГАНЦ орох цэг. Үлдэгдлийг гараар засахгүй —
 * бүх үлдэгдэл MoneyTransaction дэвтрээс тооцоологдоно.
 */

export type MoneyInput = {
  type: MoneyTransactionType;
  amount: DecimalLike;
  sourceAccount?: Account | null;
  destinationAccount?: Account | null;
  referenceType: string;
  referenceId?: string | null;
  note?: string | null;
  userId: string;
  occurredAt?: Date;
};

export async function recordMoneyTransaction(tx: Tx, input: MoneyInput): Promise<string> {
  const amount = money(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Мөнгөн дүн 0-ээс их байх ёстой.");
  }
  if (!input.sourceAccount && !input.destinationAccount) {
    throw new Error("Мөнгөний данс заагаагүй байна.");
  }

  const row = await tx.moneyTransaction.create({
    data: {
      type: input.type,
      amount,
      sourceAccount: input.sourceAccount ?? null,
      destinationAccount: input.destinationAccount ?? null,
      referenceType: input.referenceType,
      referenceId: input.referenceId ?? null,
      note: input.note ?? null,
      createdById: input.userId,
      occurredAt: input.occurredAt ?? new Date(),
    },
    select: { id: true },
  });
  return row.id;
}

export type AccountBalances = { cash: Dec; bank: Dec };

/** Данс тус бүрийн үлдэгдэл = орлого - зарлага. */
export async function getAccountBalances(
  tx: Tx = prisma,
  until?: Date,
): Promise<AccountBalances> {
  const where = until ? { occurredAt: { lte: until } } : {};

  const [inflow, outflow] = await Promise.all([
    tx.moneyTransaction.groupBy({
      by: ["destinationAccount"],
      where: { ...where, destinationAccount: { not: null } },
      _sum: { amount: true },
    }),
    tx.moneyTransaction.groupBy({
      by: ["sourceAccount"],
      where: { ...where, sourceAccount: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const balances: Record<Account, Dec> = { CASH: ZERO, BANK: ZERO };
  for (const row of inflow) {
    if (!row.destinationAccount) continue;
    balances[row.destinationAccount] = balances[row.destinationAccount].plus(d(row._sum.amount ?? 0));
  }
  for (const row of outflow) {
    if (!row.sourceAccount) continue;
    balances[row.sourceAccount] = balances[row.sourceAccount].minus(d(row._sum.amount ?? 0));
  }

  return { cash: money(balances.CASH), bank: money(balances.BANK) };
}

/**
 * Банкинд тушаах ёстой бэлэн мөнгө = кассын одоогийн үлдэгдэл.
 * (Өдрийн бэлэн орлого маргааш нь банкинд тушаагддаг журамтай.)
 */
export async function getPendingBankDeposit(tx: Tx = prisma): Promise<Dec> {
  const { cash } = await getAccountBalances(tx);
  return cash.greaterThan(0) ? cash : ZERO;
}

export const MONEY_TYPE_LABEL: Record<MoneyTransactionType, string> = {
  SUPPLIER_PAYMENT_OUT: "Нийлүүлэгчид төлсөн",
  SUPPLIER_PAYMENT_REVERSAL_IN: "Нийлүүлэгчийн төлбөр буцаалт",
  SALE_CASH_IN: "Борлуулалт — бэлэн",
  SALE_BANK_IN: "Борлуулалт — банк",
  PURCHASE_PAYMENT_OUT: "Худалдан авалтын төлбөр",
  EXPENSE_OUT: "Зардал",
  BANK_DEPOSIT: "Банкинд тушаасан",
  OWNER_ADJUSTMENT: "Эзний тохируулга",
  OTHER_IN: "Бусад орлого",
  OTHER_OUT: "Бусад зарлага",
};

export const ACCOUNT_LABEL: Record<Account, string> = {
  CASH: "Касс",
  BANK: "Банк",
};
