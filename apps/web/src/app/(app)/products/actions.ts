"use server";

import { revalidatePath } from "next/cache";
import { requireOperator, requireOwner } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { d } from "@/lib/decimal";
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
import { nextEntityCode } from "@/server/services/numbering";
import { deleteProduct } from "@/server/services/master-data";

export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireOperator();
    const parsed = productSchema.safeParse({
      name: formData.get("name"),
      categoryId: formData.get("categoryId"),
      productType: formData.get("productType"),
      sellingPrice: formNumber(formData, "sellingPrice"),
      isActive: formData.get("isActive") === "on",
      unit: formData.get("unit") ?? undefined,
      minimumStock: formNumber(formData, "minimumStock"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const isResale = parsed.data.productType === "RESALE";
    // Код нь sequence-ээс — зэрэгцээ хүсэлтэд ч давхцахгүй.
    const sku = await nextEntityCode("product");

    const product = await prisma.product.create({
      data: {
        sku,
        name: parsed.data.name,
        categoryId: parsed.data.categoryId ?? null,
        productType: parsed.data.productType,
        sellingPrice: parsed.data.sellingPrice,
        isActive: parsed.data.isActive,
        // Нөөцийн талбарууд зөвхөн RESALE-д утгатай.
        unit: isResale ? parsed.data.unit : "PCS",
        minimumStock: isResale ? parsed.data.minimumStock : 0,
      },
    });

    await writeAudit({
      userId: user.id,
      action: "PRODUCT_CREATED",
      entityType: "Product",
      entityId: product.id,
      newValue: {
        sku: product.sku,
        name: product.name,
        productType: product.productType,
        sellingPrice: product.sellingPrice.toString(),
      },
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
      name: formData.get("name"),
      categoryId: formData.get("categoryId"),
      productType: formData.get("productType"),
      sellingPrice: formNumber(formData, "sellingPrice"),
      isActive: formData.get("isActive") === "on",
      unit: formData.get("unit") ?? undefined,
      minimumStock: formNumber(formData, "minimumStock"),
    });
    if (!parsed.success) return fail("Мэдээллээ шалгана уу.", fieldErrors(parsed.error));

    const before = await prisma.product.findUnique({
      where: { id: parsed.data.id },
      include: { _count: { select: { recipeItems: true } } },
    });
    if (!before) return fail("Бүтээгдэхүүн олдсонгүй.");

    // Төрөл солих нь өртгийн эх сурвалжийг өөрчилдөг тул хязгаартай.
    const typeChanged = before.productType !== parsed.data.productType;
    if (typeChanged) {
      if (!d(before.quantity).equals(0)) {
        return fail("Үлдэгдэлтэй бүтээгдэхүүний төрлийг солих боломжгүй.");
      }
      if (parsed.data.productType === "RESALE" && before._count.recipeItems > 0) {
        return fail("Жортой бүтээгдэхүүнийг дамжуулан борлуулах болгох бол эхлээд жорыг нь хоосолно уу.");
      }
    }

    const isResale = parsed.data.productType === "RESALE";
    // Үлдэгдэлтэй бүтээгдэхүүний үндсэн нэгжийг солих нь өртгийг гажуудуулна.
    if (isResale && before.unit !== parsed.data.unit && !d(before.quantity).equals(0)) {
      return fail("Үлдэгдэлтэй бүтээгдэхүүний нэгжийг солих боломжгүй.");
    }

    const updated = await prisma.product.update({
      where: { id: parsed.data.id },
      data: {
        // Код өөрчлөгдөхгүй — түүхэн баримтуудын холбоос тогтвортой байна.
        name: parsed.data.name,
        categoryId: parsed.data.categoryId ?? null,
        productType: parsed.data.productType,
        sellingPrice: parsed.data.sellingPrice,
        isActive: parsed.data.isActive,
        unit: isResale ? parsed.data.unit : "PCS",
        minimumStock: isResale ? parsed.data.minimumStock : 0,
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
        productType: before.productType,
        sellingPrice: before.sellingPrice.toString(),
        unit: before.unit,
        minimumStock: before.minimumStock.toString(),
        isActive: before.isActive,
      },
      newValue: {
        sku: updated.sku,
        name: updated.name,
        productType: updated.productType,
        sellingPrice: updated.sellingPrice.toString(),
        unit: updated.unit,
        minimumStock: updated.minimumStock.toString(),
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

/**
 * Бүтээгдэхүүнийг БҮР МӨСӨН устгах — ЗӨВХӨН OWNER.
 * Түүхэнд ашиглагдсан бол үйлчилгээний давхарга татгалзана.
 */
export async function deleteProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireOwner();
    const id = String(formData.get("id") ?? "");
    if (!id) return fail("Бүтээгдэхүүн сонгогдоогүй байна.");

    await deleteProduct({ id, userId: user.id, ipAddress: await getClientIp() });

    revalidatePath("/products");
    return ok("Бүтээгдэхүүн устгагдлаа.");
  } catch (error) {
    return toActionError(error);
  }
}
