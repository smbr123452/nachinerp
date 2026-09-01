import "server-only";
import { cost as toCost, d, money, ZERO, type Dec } from "@/lib/decimal";
import { convertQuantity, unitLabel } from "@/lib/units";
import type { Tx } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";

export type RecipeLineCost = {
  rawMaterialId: string;
  materialName: string;
  materialSku: string;
  quantity: Dec;
  unit: string;
  /** Материалын үндсэн нэгж рүү хөрвүүлсэн хэрэглээ. */
  baseQuantity: Dec;
  baseUnit: string;
  averageCost: Dec;
  lineCost: Dec;
  availableQuantity: Dec;
};

export type ProductCostSummary = {
  productId: string;
  lines: RecipeLineCost[];
  recipeCost: Dec;
  sellingPrice: Dec;
  grossProfit: Dec;
  /** Хувиар (60.4 = 60.4%). */
  grossMargin: Dec;
  hasRecipe: boolean;
};

/**
 * Бүтээгдэхүүний ОДООГИЙН жорын өртөг — материалын одоогийн жигнэсэн
 * дундаж өртгөөр. Өнгөрсөн борлуулалтын өртөг үүнээс хамаарахгүй
 * (тэр нь SaleItem.unitCost дээр царцаж хадгалагдана).
 */
export async function calculateRecipeCost(
  productId: string,
  tx: Tx = prisma,
): Promise<ProductCostSummary> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    include: {
      recipeItems: { include: { rawMaterial: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!product) throw new Error("Бүтээгдэхүүн олдсонгүй.");

  const lines: RecipeLineCost[] = product.recipeItems.map((item) => {
    const baseQuantity = convertQuantity(item.quantity, item.unit, item.rawMaterial.unit);
    const averageCost = d(item.rawMaterial.averageCost);
    return {
      rawMaterialId: item.rawMaterialId,
      materialName: item.rawMaterial.name,
      materialSku: item.rawMaterial.sku,
      quantity: d(item.quantity),
      unit: unitLabel(item.unit),
      baseQuantity,
      baseUnit: unitLabel(item.rawMaterial.unit),
      averageCost,
      lineCost: baseQuantity.times(averageCost).toDecimalPlaces(2),
      availableQuantity: d(item.rawMaterial.quantity),
    };
  });

  const recipeCost = money(lines.reduce<Dec>((acc, l) => acc.plus(l.lineCost), ZERO));
  const sellingPrice = money(product.sellingPrice);
  const grossProfit = money(sellingPrice.minus(recipeCost));
  const grossMargin = sellingPrice.greaterThan(0)
    ? grossProfit.dividedBy(sellingPrice).times(100).toDecimalPlaces(1)
    : ZERO;

  return {
    productId,
    lines,
    recipeCost,
    sellingPrice,
    grossProfit,
    grossMargin,
    hasRecipe: lines.length > 0,
  };
}

/** Олон бүтээгдэхүүний жорын өртгийг нэг дор (жагсаалтын хуудсанд). */
export async function calculateRecipeCosts(
  productIds: string[],
  tx: Tx = prisma,
): Promise<Map<string, Dec>> {
  if (productIds.length === 0) return new Map();

  const items = await tx.recipeItem.findMany({
    where: { productId: { in: productIds } },
    include: { rawMaterial: { select: { unit: true, averageCost: true } } },
  });

  const result = new Map<string, Dec>();
  for (const id of productIds) result.set(id, ZERO);
  for (const item of items) {
    const baseQuantity = convertQuantity(item.quantity, item.unit, item.rawMaterial.unit);
    const lineCost = baseQuantity.times(d(item.rawMaterial.averageCost));
    result.set(item.productId, (result.get(item.productId) ?? ZERO).plus(lineCost));
  }
  for (const [key, value] of result) result.set(key, toCost(value).toDecimalPlaces(2));
  return result;
}
