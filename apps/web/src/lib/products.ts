import type { ProductType } from "@prisma/client";

/**
 * Бүтээгдэхүүний төрлийн шошго.
 *
 * ЭНЭ ФАЙЛ "use client" БИШ байх ёстой: шошгыг сервер ба клиент хоёул
 * ашигладаг. "use client" модулиас энгийн объект экспортлоход сервер тал
 * нь бодит утгын оронд клиент лавлагаа авдаг тул хоосон харагдана.
 */
export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  MANUFACTURED: "Үйлдвэрлэдэг",
  RESALE: "Худалдан авч борлуулдаг",
};

export const PRODUCT_TYPES = Object.keys(PRODUCT_TYPE_LABEL) as ProductType[];
