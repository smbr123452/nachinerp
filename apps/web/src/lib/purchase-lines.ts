/**
 * Худалдан авалтын мөрөөс баталгаажуулах модалын мөр гаргах ГАНЦ дүрэм.
 *
 * Тусад нь файлд гаргасан шалтгаан: key-ийн давтагдашгүй байдлыг шалгалтаар
 * барихын тулд. Нэг нэхэмжлэхэд ижил бараа өөр үнээр хоёр мөр болж орох нь
 * ЗӨВ өгөгдөл тул key нь бараагаар биш, МӨРӨӨР тодорхойлогдоно.
 */

export type PurchaseLineLike = {
  /** Мөрийн тогтвортой дугаар. */
  id: string;
  itemKey: string;
  quantity: string;
  unitPrice: string;
};

export type ConfirmLineData = {
  key: string;
  itemKey: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

/** Формын текст утгыг тоо болгоно (хоосон зай, таслалыг үл тооно). */
export function lineNumber(value: string): number {
  const parsed = Number(value.replace(/\s|,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Бөглөгдсөн мөрүүдийг баталгаажуулах жагсаалт болгоно.
 *
 * Бараагүй эсвэл тоо хэмжээ 0 мөрийг алгасна. Үлдсэн мөр бүр өөрийн
 * дугаартай тул хоёр мөр ижил бараатай байсан ч key давхцахгүй.
 */
export function buildConfirmLines(rows: PurchaseLineLike[]): ConfirmLineData[] {
  return rows
    .filter((row) => row.itemKey && lineNumber(row.quantity) > 0)
    .map((row) => {
      const quantity = lineNumber(row.quantity);
      const unitPrice = lineNumber(row.unitPrice);
      return {
        key: row.id,
        itemKey: row.itemKey,
        quantity,
        unitPrice,
        subtotal: quantity * unitPrice,
      };
    });
}
