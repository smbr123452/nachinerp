import "server-only";
import { d, type Dec } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";

/**
 * Нийлүүлэгчид тулгуурласан ухаалаг худалдан авалт.
 *
 * Бүх мэдээлэл нь БАТЛАГДСАН (POSTED) худалдан авалтын түүхээс гарна —
 * тусдаа "сүүлийн үнэ" хүснэгт үүсгэхгүй. Ингэснээр цуцлагдсан баримт
 * автоматаар тооцооноос гарч, түүхэн үнэ хэзээ ч дарагдахгүй.
 *
 * ЧУХАЛ: эдгээр нь ЗӨВХӨН САНАЛ. Формд мөр автоматаар нэмэгдэхгүй —
 * хэрэглэгч өөрөө сонгож нэмнэ.
 */

export type SupplierSuggestion = {
  /** "rm:<id>" эсвэл "pr:<id>" — формд давхардлыг таних түлхүүр. */
  key: string;
  rawMaterialId: string | null;
  productId: string | null;
  name: string;
  sku: string;
  unit: string;
  /** Тухайн нийлүүлэгчээс сүүлд авсан үнэ (бичсэн нэгжээр). */
  lastUnitPrice: string;
  lastUnit: string;
  lastPurchaseDate: Date;
  /** Хэдэн удаа авсан бэ — саналын дараалалд ашиглана. */
  timesPurchased: number;
  /** Сүүлд авсан тоо хэмжээ — санал болгох хэмжээ болгон ашиглана. */
  lastQuantity: string;
};

type ItemRow = {
  rawMaterialId: string | null;
  productId: string | null;
  quantity: Dec;
  unit: string;
  unitPrice: Dec;
  date: Date;
  name: string;
  sku: string;
};

function keyOf(rawMaterialId: string | null, productId: string | null): string {
  return rawMaterialId ? `rm:${rawMaterialId}` : `pr:${productId}`;
}

/**
 * Тухайн нийлүүлэгчээс өмнө авч байсан бараануудын жагсаалт.
 * Хамгийн сүүлийн үнэ ба тухайн үеийн нэгжийг буцаана.
 */
export async function getSupplierSuggestions(supplierId: string): Promise<SupplierSuggestion[]> {
  const items = await prisma.purchaseItem.findMany({
    where: { purchase: { supplierId, status: "POSTED" } },
    include: {
      purchase: { select: { date: true } },
      rawMaterial: { select: { name: true, sku: true, isActive: true } },
      product: { select: { name: true, sku: true, isActive: true, productType: true } },
    },
    orderBy: { purchase: { date: "desc" } },
  });

  const byKey = new Map<string, { rows: ItemRow[]; latest: ItemRow }>();

  for (const item of items) {
    // Идэвхгүй болсон, эсвэл RESALE биш болсон зүйлийг санал болгохгүй.
    const target = item.rawMaterial ?? item.product;
    if (!target || !target.isActive) continue;
    if (item.product && item.product.productType !== "RESALE") continue;

    const row: ItemRow = {
      rawMaterialId: item.rawMaterialId,
      productId: item.productId,
      quantity: d(item.quantity),
      unit: item.unit,
      unitPrice: d(item.unitPrice),
      date: item.purchase.date,
      name: target.name,
      sku: target.sku,
    };

    const key = keyOf(item.rawMaterialId, item.productId);
    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push(row);
      // Хамгийн сүүлийн огноотойг барина (тэнцвэл эхнийх нь — жагсаалт
      // огноогоор буурахаар эрэмбэлэгдсэн).
      if (row.date > existing.latest.date) existing.latest = row;
    } else {
      byKey.set(key, { rows: [row], latest: row });
    }
  }

  return [...byKey.entries()]
    .map(([key, { rows, latest }]) => ({
      key,
      rawMaterialId: latest.rawMaterialId,
      productId: latest.productId,
      name: latest.name,
      sku: latest.sku,
      unit: latest.unit,
      lastUnitPrice: latest.unitPrice.toString(),
      lastUnit: latest.unit,
      lastPurchaseDate: latest.date,
      timesPurchased: rows.length,
      lastQuantity: latest.quantity.toString(),
    }))
    .sort(
      (a, b) =>
        b.lastPurchaseDate.getTime() - a.lastPurchaseDate.getTime() ||
        a.name.localeCompare(b.name, "mn"),
    );
}

export type PriceHistoryEntry = {
  purchaseId: string;
  purchaseNo: string;
  date: Date;
  supplierId: string | null;
  supplierName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  /** Үндсэн нэгж рүү хөрвүүлсэн өртөг — өөр нэгжээр авсныг харьцуулна. */
  baseUnitCost: string;
};

/**
 * Нэг бараа / бүтээгдэхүүний үнийн түүх, нийлүүлэгч тус бүрээр.
 * Түүхэн үнэ дарагдахгүй — бүх батлагдсан мөр хэвээр харагдана.
 */
export async function getPriceHistory(
  subject: { rawMaterialId?: string | null; productId?: string | null },
  limit = 50,
): Promise<PriceHistoryEntry[]> {
  const items = await prisma.purchaseItem.findMany({
    where: {
      ...(subject.rawMaterialId ? { rawMaterialId: subject.rawMaterialId } : {}),
      ...(subject.productId ? { productId: subject.productId } : {}),
      purchase: { status: "POSTED" },
    },
    include: {
      purchase: {
        select: {
          id: true,
          purchaseNo: true,
          date: true,
          supplierId: true,
          supplier: { select: { name: true } },
        },
      },
    },
    orderBy: { purchase: { date: "desc" } },
    take: limit,
  });

  return items.map((item) => ({
    purchaseId: item.purchase.id,
    purchaseNo: item.purchase.purchaseNo,
    date: item.purchase.date,
    supplierId: item.purchase.supplierId,
    supplierName: item.purchase.supplier?.name ?? "Нийлүүлэгчгүй",
    quantity: item.quantity.toString(),
    unit: item.unit,
    unitPrice: item.unitPrice.toString(),
    baseUnitCost: item.baseUnitCost.toString(),
  }));
}

/**
 * Нийлүүлэгч бүрээр сүүлийн авсан үнэ — нэг барааны хувьд.
 * "Хаанаас хямд авах вэ" гэдгийг харуулахад ашиглана.
 */
export async function getLastPriceBySupplier(subject: {
  rawMaterialId?: string | null;
  productId?: string | null;
}): Promise<{ supplierId: string | null; supplierName: string; unitPrice: string; unit: string; date: Date }[]> {
  const history = await getPriceHistory(subject, 200);
  const seen = new Map<string, PriceHistoryEntry>();

  // Түүх огноогоор буурахаар ирдэг тул нийлүүлэгч тус бүрийн ЭХНИЙ мөр
  // нь хамгийн сүүлийнх.
  for (const entry of history) {
    const key = entry.supplierId ?? "none";
    if (!seen.has(key)) seen.set(key, entry);
  }

  return [...seen.values()].map((entry) => ({
    supplierId: entry.supplierId,
    supplierName: entry.supplierName,
    unitPrice: entry.unitPrice,
    unit: entry.unit,
    date: entry.date,
  }));
}
