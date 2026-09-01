import "server-only";
import { d, money } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { applyMovement } from "./inventory";
import { recordMoneyTransaction } from "./money";

import type { ManualMovementType } from "@/lib/movements";

/** Нөөцийн гар тохируулга — тайлбар заавал. */
export async function postManualAdjustment(params: {
  rawMaterialId: string;
  movementType: ManualMovementType;
  quantity: string | number;
  note: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  if (!params.note.trim()) throw new Error("Тохируулгын шалтгааныг бичнэ үү.");

  await prisma.$transaction(async (tx) => {
    const result = await applyMovement(tx, {
      rawMaterialId: params.rawMaterialId,
      movementType: params.movementType,
      quantity: params.quantity,
      costPolicy: { mode: "AVERAGE" },
      referenceType: "MANUAL",
      referenceId: null,
      note: params.note,
      userId: params.userId,
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "MANUAL_ADJUSTMENT",
        entityType: "RawMaterial",
        entityId: params.rawMaterialId,
        newValue: {
          movementType: params.movementType,
          quantity: d(params.quantity).toString(),
          unitCost: result.unitCost.toString(),
          balanceAfter: result.balanceAfter.toString(),
        },
        note: params.note,
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}

/**
 * Банкинд бэлэн мөнгө тушаах: кассаас гарч банкинд орно.
 */
export async function postBankDeposit(params: {
  amount: string | number;
  date: Date;
  note?: string | null;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const amount = money(params.amount);
  if (amount.lessThanOrEqualTo(0)) throw new Error("Тушаах дүн 0-ээс их байх ёстой.");

  await prisma.$transaction(async (tx) => {
    await recordMoneyTransaction(tx, {
      type: "BANK_DEPOSIT",
      amount,
      sourceAccount: "CASH",
      destinationAccount: "BANK",
      referenceType: "BANK_DEPOSIT",
      note: params.note ?? null,
      userId: params.userId,
      occurredAt: params.date,
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "BANK_DEPOSIT",
        entityType: "MoneyTransaction",
        newValue: { amount: amount.toString() },
        note: params.note ?? null,
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}

/** Эзний мөнгөн тохируулга (тооцоо тулгах). */
export async function postMoneyAdjustment(params: {
  account: "CASH" | "BANK";
  direction: "IN" | "OUT";
  amount: string | number;
  note: string;
  date: Date;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const amount = money(params.amount);
  if (amount.lessThanOrEqualTo(0)) throw new Error("Дүн 0-ээс их байх ёстой.");
  if (!params.note.trim()) throw new Error("Тайлбар бичнэ үү.");

  await prisma.$transaction(async (tx) => {
    await recordMoneyTransaction(tx, {
      type: "OWNER_ADJUSTMENT",
      amount,
      sourceAccount: params.direction === "OUT" ? params.account : null,
      destinationAccount: params.direction === "IN" ? params.account : null,
      referenceType: "ADJUSTMENT",
      note: params.note,
      userId: params.userId,
      occurredAt: params.date,
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "MONEY_ADJUSTMENT",
        entityType: "MoneyTransaction",
        newValue: { account: params.account, direction: params.direction, amount: amount.toString() },
        note: params.note,
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}
