import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

/**
 * Ангиллын удирдлага — түүхий эд ба бүтээгдэхүүнд НЭГ ижил дүрэм.
 *
 * Аюулгүй байдлын гол дүрэм:
 *   - Нэмэх / нэр солих / идэвхгүй болгох / сэргээх — OWNER ба MANAGER.
 *   - БҮР МӨСӨН УСТГАХ — ЗӨВХӨН OWNER, мөн ашиглагдаагүй үед л.
 * Эрхийн шалгалт дуудагч талд биш, энд серверт хийгдэнэ.
 *
 * Ашиглагдаж буй ангиллыг устгахгүй — оронд нь идэвхгүй болгоно. Ингэснээр
 * түүхэн бичлэгүүд ангиллаа алдахгүй.
 */

export type CategoryKind = "rawMaterial" | "product";

export type CategoryRow = {
  id: string;
  name: string;
  isActive: boolean;
  /** Тухайн ангилалд харьяалагдах бичлэгийн тоо. 0 бол устгахад аюулгүй. */
  usageCount: number;
};

const KIND_LABEL: Record<CategoryKind, string> = {
  rawMaterial: "Бараа материалын ангилал",
  product: "Бүтээгдэхүүний ангилал",
};

/**
 * Prisma-ийн delegate-үүд нэгдмэл (union) хэлбэрээр дуудагдахгүй тул
 * доорх туслахууд төрөл бүрд тодорхой салаална.
 */
type CategoryRecord = { id: string; name: string; isActive: boolean };

function findCategory(
  kind: CategoryKind,
  id: string,
  tx: Pick<typeof prisma, "rawMaterialCategory" | "productCategory"> = prisma,
): Promise<CategoryRecord | null> {
  return kind === "rawMaterial"
    ? tx.rawMaterialCategory.findUnique({ where: { id } })
    : tx.productCategory.findUnique({ where: { id } });
}

function createCategoryRow(kind: CategoryKind, name: string): Promise<CategoryRecord> {
  return kind === "rawMaterial"
    ? prisma.rawMaterialCategory.create({ data: { name } })
    : prisma.productCategory.create({ data: { name } });
}

function updateCategoryRow(
  kind: CategoryKind,
  id: string,
  data: { name?: string; isActive?: boolean },
): Promise<CategoryRecord> {
  return kind === "rawMaterial"
    ? prisma.rawMaterialCategory.update({ where: { id }, data })
    : prisma.productCategory.update({ where: { id }, data });
}

function entityType(kind: CategoryKind): string {
  return kind === "rawMaterial" ? "RawMaterialCategory" : "ProductCategory";
}

/** Ангиллын жагсаалт, ашиглалтын тоотой. */
export async function listCategories(kind: CategoryKind): Promise<CategoryRow[]> {
  if (kind === "rawMaterial") {
    const rows = await prisma.rawMaterialCategory.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { rawMaterials: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
      usageCount: r._count.rawMaterials,
    }));
  }

  const rows = await prisma.productCategory.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isActive: r.isActive,
    usageCount: r._count.products,
  }));
}

async function usageCount(kind: CategoryKind, categoryId: string): Promise<number> {
  return kind === "rawMaterial"
    ? prisma.rawMaterial.count({ where: { categoryId } })
    : prisma.product.count({ where: { categoryId } });
}

export async function createCategory(params: {
  kind: CategoryKind;
  name: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const created = await createCategoryRow(params.kind, params.name);
  await writeAudit({
    userId: params.userId,
    action: "CATEGORY_CREATED",
    entityType: entityType(params.kind),
    entityId: created.id,
    newValue: { name: created.name },
    note: KIND_LABEL[params.kind],
    ipAddress: params.ipAddress,
  });
}

export async function renameCategory(params: {
  kind: CategoryKind;
  id: string;
  name: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const before = await findCategory(params.kind, params.id);
  if (!before) throw new Error("Ангилал олдсонгүй.");
  if (before.name === params.name) return;

  const updated = await updateCategoryRow(params.kind, params.id, { name: params.name });
  await writeAudit({
    userId: params.userId,
    action: "CATEGORY_RENAMED",
    entityType: entityType(params.kind),
    entityId: updated.id,
    oldValue: { name: before.name },
    newValue: { name: updated.name },
    note: KIND_LABEL[params.kind],
    ipAddress: params.ipAddress,
  });
}

/**
 * Идэвхтэй / идэвхгүй төлөв солих.
 * Идэвхгүй ангилал шинэ бичлэгт сонгогдохгүй ч түүхэн холбоос хэвээр үлдэнэ.
 */
export async function setCategoryActive(params: {
  kind: CategoryKind;
  id: string;
  isActive: boolean;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const before = await findCategory(params.kind, params.id);
  if (!before) throw new Error("Ангилал олдсонгүй.");
  if (before.isActive === params.isActive) return;

  await updateCategoryRow(params.kind, params.id, { isActive: params.isActive });
  await writeAudit({
    userId: params.userId,
    action: params.isActive ? "CATEGORY_REACTIVATED" : "CATEGORY_DEACTIVATED",
    entityType: entityType(params.kind),
    entityId: params.id,
    oldValue: { name: before.name, isActive: before.isActive },
    newValue: { name: before.name, isActive: params.isActive },
    note: KIND_LABEL[params.kind],
    ipAddress: params.ipAddress,
  });
}

/**
 * БҮР МӨСӨН УСТГАХ. Дуудагч талд OWNER эрхийг ЗААВАЛ шалгасан байх ёстой.
 *
 * Ашиглагдаж буй ангиллыг устгахгүй — түүхэн бичлэг ангиллаа алдах эрсдэлтэй.
 * Ашиглалтын тоог устгалтай нэг гүйлгээнд шалгаснаар зэрэгцээ хүсэлт
 * ангилал руу бичлэг нэмэх зуур устгах эрсдэлээс хамгаална.
 */
export async function deleteCategory(params: {
  kind: CategoryKind;
  id: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const table = params.kind === "rawMaterial" ? "RawMaterialCategory" : "ProductCategory";
    // Ангиллын мөрийг түгжинэ — шалгалт ба устгалын хооронд өөрчлөгдөхгүй.
    await tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id = $1 FOR UPDATE`, params.id);

    const before = await findCategory(params.kind, params.id, tx);
    if (!before) throw new Error("Ангилал олдсонгүй.");

    const used =
      params.kind === "rawMaterial"
        ? await tx.rawMaterial.count({ where: { categoryId: params.id } })
        : await tx.product.count({ where: { categoryId: params.id } });

    if (used > 0) {
      throw new Error(
        `"${before.name}" ангилалд ${used} бичлэг харьяалагдаж байна. ` +
          "Устгахын оронд идэвхгүй болгоно уу.",
      );
    }

    if (params.kind === "rawMaterial") {
      await tx.rawMaterialCategory.delete({ where: { id: params.id } });
    } else {
      await tx.productCategory.delete({ where: { id: params.id } });
    }

    await writeAudit(
      {
        userId: params.userId,
        action: "CATEGORY_DELETED",
        entityType: entityType(params.kind),
        entityId: params.id,
        oldValue: { name: before.name, isActive: before.isActive },
        note: KIND_LABEL[params.kind],
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}

export { usageCount };
