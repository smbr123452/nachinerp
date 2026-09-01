import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { subjectOf, type StockSubject } from "./inventory";

/**
 * Нийлүүлэгчийн мастер өгөгдөл ба "эндээс авдаг бараа" холбоос.
 *
 * ГОЛ ЗАРЧИМ — гурван ойлголтыг ХЭЗЭЭ Ч хольж хутгахгүй:
 *   Supplier     — мастер өгөгдөл (хэн)
 *   SupplierItem — сонголт / хэвшил ("энэ барааг эндээс авдаг")
 *   PurchaseItem — БОДИТ түүх (хэзээ, хэдээр авсан)
 *
 * Тиймээс SupplierItem дээр үнэ ОГТ хадгалахгүй. Сүүлийн үнэ, огноо нь
 * үргэлж батлагдсан (POSTED) худалдан авалтын түүхээс бодогдоно.
 *
 * Энэ файл нөөц, өртөг, мөнгөнд ХЭЗЭЭ Ч хүрэхгүй — нийлүүлэгч нэмэх нь
 * үлдэгдэл ч, жигнэсэн дундаж өртөг ч өөрчлөхгүй.
 */

export type SupplierListRow = {
  id: string;
  name: string;
  phone: string | null;
  contactPerson: string | null;
  email: string | null;
  note: string | null;
  isActive: boolean;
  /** Холбогдсон барааны тоо (сонголт, түүх биш). */
  itemCount: number;
  /** Батлагдсан худалдан авалтын тоо. */
  purchaseCount: number;
  lastPurchaseDate: Date | null;
};

export type SupplierItemRow = {
  id: string;
  subject: StockSubject;
  name: string;
  sku: string;
  unit: string;
  /** "rawMaterial" эсвэл "product" — дэлгэцэнд Түүхий эд / Бэлэн бүтээгдэхүүн. */
  kind: "rawMaterial" | "product";
  isActive: boolean;
};

/** Нэрийг харьцуулах хэлбэрт оруулна (DB дэх нормчилсон индекстэй ижил дүрэм). */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Уншилт
// ---------------------------------------------------------------------------

export async function listSuppliers(filter?: {
  query?: string;
  status?: "active" | "inactive";
}): Promise<SupplierListRow[]> {
  const suppliers = await prisma.supplier.findMany({
    where: {
      ...(filter?.query
        ? {
            OR: [
              { name: { contains: filter.query, mode: "insensitive" as const } },
              { contactPerson: { contains: filter.query, mode: "insensitive" as const } },
              { phone: { contains: filter.query, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(filter?.status === "active" ? { isActive: true } : {}),
      ...(filter?.status === "inactive" ? { isActive: false } : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { items: true } },
    },
  });

  if (suppliers.length === 0) return [];

  // Сүүлийн батлагдсан худалдан авалтыг нийлүүлэгч тус бүрээр — мөр бүрд
  // тусад нь асуулга явуулахгүй (N+1-ээс сэргийлнэ).
  const grouped = await prisma.purchase.groupBy({
    by: ["supplierId"],
    where: { status: "POSTED", supplierId: { in: suppliers.map((s) => s.id) } },
    _count: { _all: true },
    _max: { date: true },
  });
  const stats = new Map(
    grouped
      .filter((g) => g.supplierId)
      .map((g) => [g.supplierId!, { count: g._count._all, last: g._max.date }]),
  );

  return suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    contactPerson: s.contactPerson,
    email: s.email,
    note: s.note,
    isActive: s.isActive,
    itemCount: s._count.items,
    purchaseCount: stats.get(s.id)?.count ?? 0,
    lastPurchaseDate: stats.get(s.id)?.last ?? null,
  }));
}

export async function getSupplier(id: string) {
  return prisma.supplier.findUnique({ where: { id } });
}

/** Нийлүүлэгчид холбогдсон бараанууд. Үнэ энд БАЙХГҮЙ — түүхээс тусад нь. */
export async function listSupplierItems(supplierId: string): Promise<SupplierItemRow[]> {
  const rows = await prisma.supplierItem.findMany({
    where: { supplierId },
    include: {
      rawMaterial: { select: { name: true, sku: true, unit: true, isActive: true } },
      product: { select: { name: true, sku: true, unit: true, isActive: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.flatMap((row) => {
    const target = row.rawMaterial ?? row.product;
    if (!target) return [];
    return [
      {
        id: row.id,
        subject: subjectOf({ rawMaterialId: row.rawMaterialId, productId: row.productId }),
        name: target.name,
        sku: target.sku,
        unit: target.unit,
        kind: row.rawMaterialId ? ("rawMaterial" as const) : ("product" as const),
        isActive: target.isActive,
      },
    ];
  });
}

/**
 * Холбож болох бараанууд: идэвхтэй түүхий эд ба идэвхтэй БЭЛЭН бүтээгдэхүүн.
 * Үйлдвэрлэдэг бүтээгдэхүүнийг худалдаж авдаггүй тул орохгүй.
 * Аль хэдийн холбогдсоныг хасна.
 */
export async function listEligibleItems(supplierId: string) {
  const [materials, products, existing] = await Promise.all([
    prisma.rawMaterial.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, unit: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, productType: "RESALE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, unit: true },
    }),
    prisma.supplierItem.findMany({
      where: { supplierId },
      select: { rawMaterialId: true, productId: true },
    }),
  ]);

  const taken = new Set(
    existing.map((e) => (e.rawMaterialId ? `rm:${e.rawMaterialId}` : `pr:${e.productId}`)),
  );

  return [
    ...materials.map((m) => ({
      key: `rm:${m.id}`,
      kind: "rawMaterial" as const,
      id: m.id,
      name: m.name,
      sku: m.sku,
      unit: m.unit,
    })),
    ...products.map((p) => ({
      key: `pr:${p.id}`,
      kind: "product" as const,
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
    })),
  ].filter((item) => !taken.has(item.key));
}

// ---------------------------------------------------------------------------
// Бичилт — мастер өгөгдөл
// ---------------------------------------------------------------------------

export type SupplierInput = {
  name: string;
  phone?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  note?: string | null;
};

export async function createSupplier(params: {
  input: SupplierInput;
  userId: string;
  ipAddress?: string | null;
}): Promise<{ id: string; name: string }> {
  const name = normalizeName(params.input.name);
  if (!name) throw new Error("Нийлүүлэгчийн нэрийг бичнэ үү.");

  const supplier = await prisma.supplier.create({
    data: {
      name,
      phone: params.input.phone ?? null,
      contactPerson: params.input.contactPerson ?? null,
      email: params.input.email ?? null,
      note: params.input.note ?? null,
    },
  });

  await writeAudit({
    userId: params.userId,
    action: "SUPPLIER_CREATED",
    entityType: "Supplier",
    entityId: supplier.id,
    newValue: { name: supplier.name, phone: supplier.phone },
    ipAddress: params.ipAddress,
  });

  return { id: supplier.id, name: supplier.name };
}

export async function updateSupplier(params: {
  id: string;
  input: SupplierInput;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const name = normalizeName(params.input.name);
  if (!name) throw new Error("Нийлүүлэгчийн нэрийг бичнэ үү.");

  const before = await prisma.supplier.findUnique({ where: { id: params.id } });
  if (!before) throw new Error("Нийлүүлэгч олдсонгүй.");

  // Нэр солих нь ЗӨВХӨН мастер дээрх харагдах нэрийг өөрчилнө. Түүхэн
  // баримтууд ижил supplierId-аар холбоотой хэвээр — юу ч дахин бичигдэхгүй.
  const after = await prisma.supplier.update({
    where: { id: params.id },
    data: {
      name,
      phone: params.input.phone ?? null,
      contactPerson: params.input.contactPerson ?? null,
      email: params.input.email ?? null,
      note: params.input.note ?? null,
    },
  });

  await writeAudit({
    userId: params.userId,
    action: "SUPPLIER_UPDATED",
    entityType: "Supplier",
    entityId: after.id,
    oldValue: {
      name: before.name,
      phone: before.phone,
      contactPerson: before.contactPerson,
      email: before.email,
    },
    newValue: {
      name: after.name,
      phone: after.phone,
      contactPerson: after.contactPerson,
      email: after.email,
    },
    ipAddress: params.ipAddress,
  });
}

export async function setSupplierActive(params: {
  id: string;
  isActive: boolean;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const before = await prisma.supplier.findUnique({ where: { id: params.id } });
  if (!before) throw new Error("Нийлүүлэгч олдсонгүй.");
  if (before.isActive === params.isActive) return;

  await prisma.supplier.update({ where: { id: params.id }, data: { isActive: params.isActive } });

  await writeAudit({
    userId: params.userId,
    action: params.isActive ? "SUPPLIER_REACTIVATED" : "SUPPLIER_DEACTIVATED",
    entityType: "Supplier",
    entityId: params.id,
    oldValue: { name: before.name, isActive: before.isActive },
    newValue: { name: before.name, isActive: params.isActive },
    ipAddress: params.ipAddress,
  });
}

// ---------------------------------------------------------------------------
// Аюулгүй устгал
// ---------------------------------------------------------------------------

export type SupplierUsage = { label: string; count: number };

/** Устгахад саад болох холбоосууд. Хоосон бол устгах аюулгүй. */
export async function getSupplierUsage(id: string): Promise<SupplierUsage[]> {
  const [purchases, items] = await Promise.all([
    prisma.purchase.count({ where: { supplierId: id } }),
    prisma.supplierItem.count({ where: { supplierId: id } }),
  ]);
  return [
    { label: "худалдан авалт", count: purchases },
    { label: "холбогдсон бараа", count: items },
  ].filter((row) => row.count > 0);
}

/**
 * Нийлүүлэгчийг БҮР МӨСӨН устгах. Дуудагч талд OWNER эрхийг ЗААВАЛ шалгасан байна.
 *
 * Худалдан авалтын түүхтэй бол устгахгүй — түүх нь supplierId-аар холбоотой
 * тул устгавал өнгөрсөн баримтууд нийлүүлэгчээ алдана. Оронд нь идэвхгүй болгоно.
 *
 * Шалгалт ба устгалт нэг гүйлгээнд, мөрийг түгжсэн байдлаар явагдана:
 * зэрэгцээ хүсэлт шалгалтын дараа худалдан авалт нэмж чадахгүй.
 */
export async function deleteSupplier(params: {
  id: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id = ${params.id} FOR UPDATE`;

    const supplier = await tx.supplier.findUnique({ where: { id: params.id } });
    if (!supplier) throw new Error("Нийлүүлэгч олдсонгүй.");

    const [purchases, items] = await Promise.all([
      tx.purchase.count({ where: { supplierId: params.id } }),
      tx.supplierItem.count({ where: { supplierId: params.id } }),
    ]);

    if (purchases > 0) {
      throw new Error(
        `"${supplier.name}"-д ${purchases} худалдан авалт бүртгэгдсэн байна. ` +
          "Устгахын оронд идэвхгүй болгоно уу — өнгөрсөн баримтууд нийлүүлэгчээ алдахгүй.",
      );
    }
    if (items > 0) {
      throw new Error(
        `"${supplier.name}"-д ${items} бараа холбогдсон байна. ` +
          "Эхлээд холбоосыг нь салгана уу.",
      );
    }

    await tx.supplier.delete({ where: { id: params.id } });

    await writeAudit(
      {
        userId: params.userId,
        action: "SUPPLIER_DELETED",
        entityType: "Supplier",
        entityId: params.id,
        oldValue: { name: supplier.name, phone: supplier.phone },
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Бараа холбох / салгах
// ---------------------------------------------------------------------------

/**
 * Барааг нийлүүлэгчид холбоно.
 *
 * Энэ нь ЗӨВХӨН сонголт бүртгэх үйлдэл: худалдан авалт үүсэхгүй, нөөц
 * хөдлөхгүй, өртөг өөрчлөгдөхгүй.
 */
export async function addSupplierItem(params: {
  supplierId: string;
  itemKey: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const match = /^(rm|pr):(.+)$/.exec(params.itemKey);
  if (!match) throw new Error("Бараа сонгоно уу.");
  const [, kind, itemId] = match;

  const supplier = await prisma.supplier.findUnique({ where: { id: params.supplierId } });
  if (!supplier) throw new Error("Нийлүүлэгч олдсонгүй.");

  let itemName: string;
  if (kind === "rm") {
    const material = await prisma.rawMaterial.findUnique({ where: { id: itemId } });
    if (!material) throw new Error("Бараа материал олдсонгүй.");
    if (!material.isActive) throw new Error(`"${material.name}" идэвхгүй байна.`);
    itemName = material.name;
  } else {
    const product = await prisma.product.findUnique({ where: { id: itemId } });
    if (!product) throw new Error("Бүтээгдэхүүн олдсонгүй.");
    if (!product.isActive) throw new Error(`"${product.name}" идэвхгүй байна.`);
    // Үйлдвэрлэдэг бүтээгдэхүүнийг худалдаж авдаггүй — жороороо гардаг.
    if (product.productType !== "RESALE") {
      throw new Error(
        `"${product.name}" нь үйлдвэрлэдэг бүтээгдэхүүн тул нийлүүлэгчээс авдаг бараанд нэмэгдэхгүй.`,
      );
    }
    itemName = product.name;
  }

  // Давхардлыг өгөгдлийн сангийн UNIQUE индекс эцэслэн зогсооно;
  // энд ойлгомжтой мессеж өгөхийн тулд урьдчилж шалгав.
  const existing = await prisma.supplierItem.findFirst({
    where: {
      supplierId: params.supplierId,
      ...(kind === "rm" ? { rawMaterialId: itemId } : { productId: itemId }),
    },
  });
  if (existing) throw new Error(`"${itemName}" энэ нийлүүлэгчид аль хэдийн холбогдсон байна.`);

  const created = await prisma.supplierItem.create({
    data: {
      supplierId: params.supplierId,
      rawMaterialId: kind === "rm" ? itemId : null,
      productId: kind === "pr" ? itemId : null,
      createdById: params.userId,
    },
  });

  await writeAudit({
    userId: params.userId,
    action: "SUPPLIER_ITEM_ADDED",
    entityType: "Supplier",
    entityId: params.supplierId,
    newValue: { supplierItemId: created.id, itemKey: params.itemKey, itemName },
    note: supplier.name,
    ipAddress: params.ipAddress,
  });
}

/**
 * Холбоосыг салгана.
 *
 * ЧУХАЛ: энэ нь ЗӨВХӨН сонголтыг устгана. Худалдан авалт, худалдан авалтын
 * мөр, нөөцийн хөдөлгөөн, түүхэн үнэ, ББӨ, аудит — юу ч хөндөгдөхгүй.
 */
export async function removeSupplierItem(params: {
  supplierItemId: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<{ supplierId: string }> {
  const row = await prisma.supplierItem.findUnique({
    where: { id: params.supplierItemId },
    include: {
      supplier: { select: { name: true } },
      rawMaterial: { select: { name: true } },
      product: { select: { name: true } },
    },
  });
  if (!row) throw new Error("Холбоос олдсонгүй.");

  await prisma.supplierItem.delete({ where: { id: row.id } });

  await writeAudit({
    userId: params.userId,
    action: "SUPPLIER_ITEM_REMOVED",
    entityType: "Supplier",
    entityId: row.supplierId,
    oldValue: {
      supplierItemId: row.id,
      itemName: row.rawMaterial?.name ?? row.product?.name ?? null,
    },
    note: row.supplier.name,
    ipAddress: params.ipAddress,
  });

  return { supplierId: row.supplierId };
}
