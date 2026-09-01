"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOwner } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { fail, ok, toActionError, type ActionState } from "@/lib/action-result";
import { bankDepositSchema, fieldErrors, moneyAdjustmentSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import { postBankDeposit, postMoneyAdjustment } from "@/server/services/adjustments";

export async function bankDepositAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = bankDepositSchema.safeParse({
      date: formData.get("date"),
      amount: formData.get("amount"),
      note: formData.get("note"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    await postBankDeposit({
      amount: parsed.data.amount,
      date: parseDateInput(parsed.data.date),
      note: parsed.data.note,
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/money");
    revalidatePath("/dashboard");
    return ok("Банкны тушаалт бүртгэгдлээ.");
  } catch (error) {
    return toActionError(error);
  }
}

/** Тооцоо тулгах гар тохируулгыг зөвхөн ЭЗЭН хийнэ. */
export async function moneyAdjustmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOwner();
    const parsed = moneyAdjustmentSchema.safeParse({
      date: formData.get("date"),
      account: formData.get("account"),
      direction: formData.get("direction"),
      amount: formData.get("amount"),
      note: formData.get("note"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    await postMoneyAdjustment({
      account: parsed.data.account,
      direction: parsed.data.direction,
      amount: parsed.data.amount,
      note: parsed.data.note,
      date: parseDateInput(parsed.data.date),
      userId: user.id,
      ipAddress: await getClientIp(),
    });

    revalidatePath("/money");
    revalidatePath("/dashboard");
    return ok("Тохируулга бүртгэгдлээ.");
  } catch (error) {
    return toActionError(error);
  }
}
