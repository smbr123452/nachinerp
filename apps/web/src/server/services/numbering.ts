import "server-only";
import { prisma, type Tx } from "@/lib/prisma";

const SEQUENCES = {
  purchase: { seq: "purchase_no_seq", prefix: "ХА" },
  saleBatch: { seq: "sale_batch_no_seq", prefix: "БО" },
  inventoryCount: { seq: "inventory_count_no_seq", prefix: "ТО" },
} as const;

export type DocumentKind = keyof typeof SEQUENCES;

/** Баримтын дугаар: ХА-000123. Postgres sequence тул давхцахгүй. */
export async function nextDocumentNumber(tx: Tx, kind: DocumentKind): Promise<string> {
  const { seq, prefix } = SEQUENCES[kind];
  const rows = await tx.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('${seq}') AS nextval`,
  );
  const value = Number(rows[0]?.nextval ?? 1);
  return `${prefix}-${String(value).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Мастер өгөгдлийн код (материал / бүтээгдэхүүн)
// ---------------------------------------------------------------------------

const CODE_SEQUENCES = {
  rawMaterial: { seq: "raw_material_code_seq", prefix: "RM" },
  product: { seq: "product_code_seq", prefix: "PR" },
} as const;

export type CodeKind = keyof typeof CODE_SEQUENCES;

const CODE_PAD = 4;
/** Sequence-ийн утга аль хэдийн эзэмшигдсэн код руу таарвал дараагийнх руу шилжинэ. */
const MAX_CODE_ATTEMPTS = 25;

function formatCode(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(CODE_PAD, "0")}`;
}

/**
 * Мастер өгөгдлийн дараагийн чөлөөт код (RM-0013 / PR-0005).
 *
 * MAX(sku)+1 ашиглахгүй — зэрэгцээ хоёр хүсэлт ижил код авах эрсдэлтэй.
 * Postgres sequence нь транзакцаас гадуур урагшилдаг тул зэрэгцээ дуудалт
 * бүр өөр өөр утга авна.
 *
 * Гараар оруулсан хуучин код (RM-001 гэх мэт) sequence-ийн утгатай давхцах
 * онолын магадлал үлддэг тул чөлөөт болохыг шалгаж, эзэмшигдсэн бол
 * дараагийн утга руу шилжинэ. Эцсийн баталгаа нь sku багана дээрх
 * UNIQUE индекс хэвээр.
 *
 * Транзакцаас ГАДНА дуудна — sequence урагшлах нь rollback-д буцахгүй тул
 * транзакц дотор дуудвал эвдэрсэн оролдлого бүр код "залгидаг".
 */
export async function nextEntityCode(kind: CodeKind): Promise<string> {
  const { seq, prefix } = CODE_SEQUENCES[kind];

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const rows = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
      `SELECT nextval('${seq}') AS nextval`,
    );
    const code = formatCode(prefix, Number(rows[0]?.nextval ?? 1));

    const taken =
      kind === "rawMaterial"
        ? await prisma.rawMaterial.findUnique({ where: { sku: code }, select: { id: true } })
        : await prisma.product.findUnique({ where: { sku: code }, select: { id: true } });

    if (!taken) return code;
  }

  throw new Error("Чөлөөтэй код олдсонгүй. Системийн админд хандана уу.");
}
