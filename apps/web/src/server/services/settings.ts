import "server-only";
import type { Tx } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";

export const SETTING_KEYS = {
  ALLOW_NEGATIVE_STOCK: "allow_negative_stock",
  COMPANY_NAME: "company_name",
} as const;

const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.ALLOW_NEGATIVE_STOCK]: "false",
  [SETTING_KEYS.COMPANY_NAME]: "Начин Фүүд ХХК",
};

export async function getSetting(key: string, tx: Tx = prisma): Promise<string> {
  const row = await tx.systemSetting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? "";
}

export async function setSetting(key: string, value: string, tx: Tx = prisma): Promise<void> {
  await tx.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/**
 * Анхдагчаар сөрөг үлдэгдэл ХОРИГЛОНО. Эзэн тохиргоогоор нээж болно.
 */
export async function allowNegativeStock(tx: Tx = prisma): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.ALLOW_NEGATIVE_STOCK, tx)) === "true";
}
