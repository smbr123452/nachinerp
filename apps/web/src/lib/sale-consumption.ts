/**
 * Борлуулалтад хасагдах нөөцийн ГАНЦ дүрэм.
 *
 * Урьдчилсан харагдац (браузер) ба баталгаажуулалт (сервер) хоёр ЭНЭ файлыг
 * хуваалцана. Ингэснээр "урьдчилан харуулсан зүйл" ба "бодитоор хасагдах
 * зүйл" хоёр салж чадахгүй.
 *
 * Дүрэм:
 *   MANUFACTURED — жорынх нь түүхий эд хасагдана. Бүтээгдэхүүн ӨӨРӨӨ нөөцийн
 *                  субьект БИШ тул хэзээ ч шаардлага болж гарахгүй.
 *   RESALE       — бүтээгдэхүүн өөрөө өөрийн нөөцөөс хасагдана.
 *
 * Энэ файл сервер талын модуль импортлохгүй — клиент дээр ч ажиллана.
 */

export type SubjectKind = "rawMaterial" | "product";

/** Нөөцийн субьектийн түлхүүр: "rm:<id>" эсвэл "pr:<id>". */
export function stockKey(kind: SubjectKind, id: string): string {
  return kind === "rawMaterial" ? `rm:${id}` : `pr:${id}`;
}

export type RecipeLine = {
  rawMaterialId: string;
  /** Материалын ҮНДСЭН нэгж рүү хөрвүүлсэн, нэгж бүтээгдэхүүнд ногдох хэмжээ. */
  baseQuantity: number;
};

export type SaleProduct = {
  id: string;
  name: string;
  productType: "MANUFACTURED" | "RESALE";
  recipe: RecipeLine[];
};

export type SaleQuantity = { productId: string; quantity: number };

/** Нэг нөөцийн субьектэд ногдох нийлбэр шаардлага. */
export type Requirement = {
  key: string;
  kind: SubjectKind;
  id: string;
  required: number;
};

/**
 * Борлуулалтын мөрүүдээс нөөцийн шаардлагыг гаргана.
 *
 * Нэг түүхий эд хэд хэдэн жорд орсон бол шаардлага нь НЭГ мөрөнд нэгтгэгдэнэ
 * (жишээ нь сүү нь латте, бялуу хоёуланд орсон бол нийлбэрээр шалгагдана).
 */
export function buildSaleRequirements(
  rows: SaleQuantity[],
  productById: Map<string, SaleProduct>,
): Requirement[] {
  const totals = new Map<string, Requirement>();

  const add = (kind: SubjectKind, id: string, amount: number) => {
    if (!(amount > 0)) return;
    const key = stockKey(kind, id);
    const existing = totals.get(key);
    if (existing) existing.required += amount;
    else totals.set(key, { key, kind, id, required: amount });
  };

  for (const row of rows) {
    const product = productById.get(row.productId);
    if (!product) continue;
    if (!(row.quantity > 0)) continue;

    if (product.productType === "RESALE") {
      // Бэлэн бүтээгдэхүүн — өөрийн нөөцөөс.
      add("product", product.id, row.quantity);
      continue;
    }

    // Үйлдвэрлэдэг — ЗӨВХӨН жорын түүхий эд. Бүтээгдэхүүн өөрөө орохгүй.
    for (const line of product.recipe) {
      add("rawMaterial", line.rawMaterialId, line.baseQuantity * row.quantity);
    }
  }

  return [...totals.values()];
}

export type StockRow = { key: string; name: string; quantity: number; unit: string };

/**
 * Шаардлагыг үлдэгдэлтэй тулгасан харагдацын мөр.
 *
 * `resolved: false` гэдэг нь тухайн субьектийн үлдэгдэл ОЛДООГҮЙ гэсэн үг —
 * энэ нь өгөгдлийн холболтын алдаа болохоос нөөцийн дутагдал БИШ. Иймд
 * дутагдал гэж тооцохгүй: нэргүй улаан мөр гаргаж хэрэглэгчийг төөрөгдүүлэхээ
 * больж, тодорхой анхааруулга өгнө.
 */
export type PreviewRow = Requirement & {
  name: string;
  unit: string;
  available: number;
  after: number;
  short: boolean;
  resolved: boolean;
};

export function buildSalePreview(
  rows: SaleQuantity[],
  productById: Map<string, SaleProduct>,
  stockByKey: Map<string, StockRow>,
): PreviewRow[] {
  return buildSaleRequirements(rows, productById)
    .map((req) => {
      const stock = stockByKey.get(req.key);
      const available = stock?.quantity ?? 0;
      return {
        ...req,
        name: stock?.name ?? "",
        unit: stock?.unit ?? "",
        available,
        after: available - req.required,
        // Үлдэгдэл олдоогүй мөрийг дутагдал гэж тооцохгүй.
        short: Boolean(stock) && req.required > available + 1e-9,
        resolved: Boolean(stock),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "mn"));
}
