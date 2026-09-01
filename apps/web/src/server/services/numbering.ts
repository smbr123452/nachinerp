import "server-only";
import type { Tx } from "@/lib/prisma";

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
