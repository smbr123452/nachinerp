"use server";

import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { fail, isUniqueViolation, ok, toActionError, type ActionState } from "@/lib/action-result";
import {
  fieldErrors,
  formNumber,
  parseRows,
  productSchema,
  productUpdateSchema,
  recipeSchema,
} from "@/lib/validation";
import { isConvertible, unitLabel } from "@/lib/units";

export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = productSchema.safeParse({
      sku: formData.get("sku"),
      name: formData.get("name"),
      categoryId: formData.get("categoryId"),
      sellingPrice: formNumber(formData, "sellingPrice"),
      isActive: formData.get("isActive") === "on",
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const product = await prisma.product.create({
      data: {
        sku: parsed.data.sku,
        name: parsed.data.name,
        categoryId: parsed.data.categoryId ?? null,
        sellingPrice: parsed.data.sellingPrice,
        isActive: parsed.data.isActive,
      },
    });

    await writeAudit({
      userId: user.id,
      action: "PRODUCT_CREATED",
      entityType: "Product",
      entityId: product.id,
      newValue: { sku: product.sku, name: product.name, sellingPrice: product.sellingPrice.toString() },
      ipAddress: await getClientIp(),
    });

    revalidatePath("/products");
    return ok("Бүтээгдэхүүн нэмэгдлээ.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Энэ код бүхий бүтээгдэхүүн бүртгэлтэй байна.");
    return toActionError(error);
  }
}

export async function updateProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = productUpdateSchema.safeParse({
      id: formData.get("id"),
      sku: formData.get("sku"),
      name: formData.get("name"),
      categoryId: formData.get("categoryId"),
      sellingPrice: formNumber(formData, "sellingPrice"),
      isActive: formData.get("isActive") === "on",
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const before = await prisma.product.findUnique({ where: { id: parsed.data.id } });
    if (!before) return fail("Бүтээгдэхүүн олдсонгүй.");

    const updated = await prisma.product.update({
      where: { id: parsed.data.id },
      data: {
        sku: parsed.data.sku,
        name: parsed.data.name,
        categoryId: parsed.data.categoryId ?? null,
        sellingPrice: parsed.data.sellingPrice,
        isActive: parsed.data.isActive,
      },
    });

    await writeAudit({
      userId: user.id,
      action: "PRODUCT_UPDATED",
      entityType: "Product",
      entityId: updated.id,
      oldValue: {
        sku: before.sku,
        name: before.name,
        sellingPrice: before.sellingPrice.toString(),
        isActive: before.isActive,
      },
      newValue: {
        sku: updated.sku,
        name: updated.name,
        sellingPrice: updated.sellingPrice.toString(),
        isActive: updated.isActive,
      },
      ipAddress: await getClientIp(),
    });

    revalidatePath("/products");
    revalidatePath(`/products/${updated.id}`);
    return ok("Хадгалагдлаа.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Энэ код бүхий бүтээгдэхүүн бүртгэлтэй байна.");
    return toActionError(error);
  }
}


/**
 * Жорыг бүхэлд нь солино. Хуучин / шинэ утга аудитад бүртгэгдэнэ.
 * Өнгөрсөн борлуулалтын өртөг өөрчлөгдөхгүй — тэр нь SaleItem дээр царцсан.
 */
export async function saveRecipeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const rows = parseRows(formData, "items", ["rawMaterialId", "quantity", "unit"]);
    const parsed = recipeSchema.safeParse({
      productId: formData.get("productId"),
      items: rows,
    });
    if (!parsed.success) return fail("Жорын мөрүүдийг шалгана уу.", fieldErrors(parsed.error));

    const { productId, items } = parsed.data;
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.rawMaterialId)) {
        return fail("Нэг материалыг давхардуулж оруулж болохгүй.");
      }
      seen.add(item.rawMaterialId);
    }

    const materials = await prisma.rawMaterial.findMany({
      where: { id: { in: items.map((i) => i.rawMaterialId) } },
    });
    const byId = new Map(materials.map((m) => [m.id, m]));
    for (const item of items) {
      const material = byId.get(item.rawMaterialId);
      if (!material) return fail("Бараа материал олдсонгүй.");
      if (!isConvertible(item.unit, material.unit)) {
        return fail(
          `"${material.name}" — ${unitLabel(item.unit)} нэгжийг ${unitLabel(material.unit)} рүү хөрвүүлэх боломжгүй.`,
        );
      }
    }

    const before = await prisma.recipeItem.findMany({
      where: { productId },
      select: { rawMaterialId: true, quantity: true, unit: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { productId } });
      if (items.length > 0) {
        await tx.recipeItem.createMany({
          data: items.map((item) => ({
            productId,
            rawMaterialId: item.rawMaterialId,
            quantity: item.quantity,
            unit: item.unit,
          })),
        });
      }
      await writeAudit(
        {
          userId: user.id,
          action: "RECIPE_UPDATED",
          entityType: "Product",
          entityId: productId,
          oldValue: {
            items: before.map((i) => ({
              rawMaterialId: i.rawMaterialId,
              quantity: i.quantity.toString(),
              unit: i.unit,
            })),
          },
          newValue: { items },
          ipAddress: await getClientIp(),
        },
        tx,
      );
    });

    revalidatePath(`/products/${productId}`);
    revalidatePath("/products");
    return ok("Жор хадгалагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}
