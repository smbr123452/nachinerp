"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOwner } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { fail, isUniqueViolation, ok, toActionError, type ActionState } from "@/lib/action-result";
import { cancelSchema, expenseCategorySchema, expenseSchema, fieldErrors } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import { cancelExpense, postExpense } from "@/server/services/expenses";

export async function createExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = expenseSchema.safeParse({
      date: formData.get("date"),
      categoryId: formData.get("categoryId"),
      amount: formData.get("amount"),
      account: formData.get("account"),
      description: formData.get("description"),
      receiptUrl: formData.get("receiptUrl"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    await postExpense({
      date: parseDateInput(parsed.data.date),
      categoryId: parsed.data.categoryId,
      amount: parsed.data.amount,
      account: parsed.data.account,
      description: parsed.data.description,
      receiptUrl: parsed.data.receiptUrl,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/expenses");
    revalidatePath("/money");
    revalidatePath("/dashboard");
    return ok("Зардал бүртгэгдлээ.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = cancelSchema.safeParse({ id: formData.get("id"), note: formData.get("note") });
    if (!parsed.success) return fail("Шалтгаанаа бичнэ үү.", fieldErrors(parsed.error));

    await cancelExpense({
      expenseId: parsed.data.id,
      userId: user.id,
      note: parsed.data.note,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/expenses");
    revalidatePath("/money");
    revalidatePath("/dashboard");
    return ok("Зардал цуцлагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}

/** Зардлын ангиллыг зөвхөн ЭЗЭН удирдана. */
export async function createExpenseCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOwner();
    const parsed = expenseCategorySchema.safeParse({
      name: formData.get("name"),
      isActive: formData.get("isActive") !== "off",
    });
    if (!parsed.success) return fail("Нэрээ шалгана уу.", fieldErrors(parsed.error));

    const category = await prisma.expenseCategory.create({
      data: { name: parsed.data.name, isActive: parsed.data.isActive },
    });
    await writeAudit({
      userId: user.id,
      action: "EXPENSE_CATEGORY_CREATED",
      entityType: "ExpenseCategory",
      entityId: category.id,
      newValue: { name: category.name },
      ipAddress: await getClientIp(),
    });

    revalidatePath("/expenses");
    return ok("Ангилал нэмэгдлээ.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Ийм нэртэй ангилал бүртгэлтэй байна.");
    return toActionError(error);
  }
}

export async function toggleExpenseCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOwner();
    const id = String(formData.get("id") ?? "");
    const category = await prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) return fail("Ангилал олдсонгүй.");

    const updated = await prisma.expenseCategory.update({
      where: { id },
      data: { isActive: !category.isActive },
    });
    await writeAudit({
      userId: user.id,
      action: "EXPENSE_CATEGORY_UPDATED",
      entityType: "ExpenseCategory",
      entityId: id,
      oldValue: { isActive: category.isActive },
      newValue: { isActive: updated.isActive },
      ipAddress: await getClientIp(),
    });

    revalidatePath("/expenses");
    return ok("Хадгалагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}
