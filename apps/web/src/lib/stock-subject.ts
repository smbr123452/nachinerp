import type { Unit } from "@prisma/client";

/**
 * Нөөцийн дэвтэр / худалдан авалтын мөрийг дэлгэцэнд харуулах туслах.
 *
 * Мөр бүр түүхий эд ЭСВЭЛ RESALE бүтээгдэхүүнтэй (DB CHECK-ээр яг нэг).
 * Холбоос нь тухайн субьектийн дэлгэрэнгүй хуудас руу очно.
 */
export type SubjectRow = {
  rawMaterialId: string | null;
  productId: string | null;
  rawMaterial?: { name: string; unit: Unit } | null;
  product?: { name: string; unit: Unit } | null;
};

export type SubjectDisplay = {
  name: string;
  unit: Unit | null;
  href: string | null;
};

export function subjectDisplay(row: SubjectRow): SubjectDisplay {
  if (row.rawMaterialId) {
    return {
      name: row.rawMaterial?.name ?? "—",
      unit: row.rawMaterial?.unit ?? null,
      href: `/materials/${row.rawMaterialId}`,
    };
  }
  if (row.productId) {
    return {
      name: row.product?.name ?? "—",
      unit: row.product?.unit ?? null,
      href: `/products/${row.productId}`,
    };
  }
  // Хэвийн үед хүрэхгүй — DB CHECK нь хоосон мөрийг зөвшөөрөхгүй.
  return { name: "—", unit: null, href: null };
}
