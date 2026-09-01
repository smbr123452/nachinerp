import type { ProductType } from "@prisma/client";
import { cost, D, money, type Dec, type DecimalLike } from "@/lib/decimal";

/**
 * Бүтээгдэхүүний төрлийн шошго.
 *
 * ЭНЭ ФАЙЛ "use client" БИШ байх ёстой: шошгыг сервер ба клиент хоёул
 * ашигладаг. "use client" модулиас энгийн объект экспортлоход сервер тал
 * нь бодит утгын оронд клиент лавлагаа авдаг тул хоосон харагдана.
 */
export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  MANUFACTURED: "Үйлдвэрлэдэг",
  RESALE: "Бэлэн бүтээгдэхүүн",
};

export const PRODUCT_TYPES = Object.keys(PRODUCT_TYPE_LABEL) as ProductType[];

/**
 * Бүтээгдэхүүний нэгжийн санхүүгийн үзүүлэлт.
 *
 * Өртгийн эх сурвалж нь төрлөөс хамаарна:
 *   MANUFACTURED — жорын өртөг (материалын одоогийн дундаж өртгөөр)
 *   RESALE       — өөрийн жигнэсэн дундаж авалтын өртөг
 *
 * Бүх тооцоо Decimal дээр хийгдэнэ — хөвөгч цэгийн алдаа мөнгөнд орохгүй.
 * Жагсаалт ба дэлгэрэнгүй хуудас ХОЁУЛАА эндээс тооцно: ижил бүтээгдэхүүн
 * хоёр газар өөр тоо харуулах боломжгүй.
 */
export type ProductFinancials = {
  /** Нэгжийн өртөг. Мэдэгдэхгүй бол null (жоргүй үйлдвэрлэх бүтээгдэхүүн). */
  unitCost: Dec | null;
  sellingPrice: Dec;
  /** Зарах үнэ - өртөг. Аль нэг нь мэдэгдэхгүй бол null. */
  unitProfit: Dec | null;
  /** (Зарах үнэ - өртөг) / Зарах үнэ × 100. Зарах үнэ 0 буюу сөрөг бол null. */
  marginPercent: Dec | null;
};

export function productFinancials(input: {
  productType: ProductType;
  sellingPrice: DecimalLike;
  /** RESALE-ийн жигнэсэн дундаж авалтын өртөг. */
  averageCost: DecimalLike;
  /** MANUFACTURED-ийн жорын өртөг. Жоргүй бол null. */
  recipeCost?: DecimalLike | null;
}): ProductFinancials {
  const sellingPrice = money(input.sellingPrice);

  let unitCost: Dec | null;
  if (input.productType === "RESALE") {
    // Худалдан авч байгаагүй бэлэн бүтээгдэхүүний жигнэсэн дундаж өртөг 0
    // байна — энэ нь "үнэгүй" гэсэн үг БИШ, "хараахан мэдэгдэхгүй" гэсэн үг.
    // 0-ийг өртөг гэж үзвэл ашиг нь зарах үнэтэйгээ тэнцэж, ашгийн хувь
    // 100% болж хэрэглэгчийг төөрөгдүүлнэ. Тиймээс мэдэгдэхгүй гэж үзнэ.
    const average = cost(input.averageCost);
    unitCost = average.greaterThan(0) ? average : null;
  } else {
    unitCost =
      input.recipeCost === null || input.recipeCost === undefined
        ? null
        : cost(input.recipeCost);
  }

  if (unitCost === null) {
    return { unitCost: null, sellingPrice, unitProfit: null, marginPercent: null };
  }

  const unitProfit = money(sellingPrice.minus(unitCost));

  // Тэг буюу сөрөг зарах үнэ дээр хувь тооцох нь утгагүй — тэгд хуваахаас
  // сэргийлж null буцаана (дэлгэц дээр "—").
  const marginPercent = sellingPrice.greaterThan(0)
    ? unitProfit.dividedBy(sellingPrice).times(100).toDecimalPlaces(1, D.ROUND_HALF_UP)
    : null;

  return { unitCost, sellingPrice, unitProfit, marginPercent };
}

/** Ашгийн утгын өнгө. Тэг бол саармаг — бүхэл хайрцгийг будахгүй. */
export function profitTone(value: Dec | null): "positive" | "negative" | "default" {
  if (!value || value.isZero()) return "default";
  return value.isNegative() ? "negative" : "positive";
}
