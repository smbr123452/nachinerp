"use server";

import { requireOperator } from "@/lib/auth/guards";
import {
  getSupplierItemPrices,
  getSupplierSuggestions,
  type SupplierSuggestion,
} from "@/server/services/supplier-history";
import { listSupplierItems } from "@/server/services/suppliers";

/**
 * Нийлүүлэгч сонгоход харуулах саналууд.
 *
 * ХОЁР ӨӨР ойлголтыг ТУСГААР буцаана:
 *
 *   associated — "энэ барааг эндээс авдаг" гэж ГАРААР холбосон бараа
 *                (SupplierItem). Худалдан авалт болсон гэсэн үг биш.
 *   history    — өмнө нь ҮНЭХЭЭР авсан бараа (батлагдсан түүх).
 *
 * Хоёулаа ЗӨВХӨН САНАЛ: формд автоматаар мөр нэмэгдэхгүй, хэрэглэгч дарж нэмнэ.
 * Холбогдоогүй барааг ч худалдан авах боломжтой хэвээр.
 */

export type AssociatedSuggestion = {
  key: string;
  name: string;
  sku: string;
  kind: "rawMaterial" | "product";
  /** Батлагдсан түүхээс. Хэзээ ч аваагүй бол null — үнэ зохиохгүй. */
  lastUnitPrice: string | null;
  lastUnit: string | null;
};

export type SupplierSuggestionBundle = {
  associated: AssociatedSuggestion[];
  history: SupplierSuggestion[];
};

export async function fetchSupplierSuggestionsAction(
  supplierId: string,
): Promise<SupplierSuggestionBundle> {
  await requireOperator();
  if (!supplierId) return { associated: [], history: [] };

  const [items, prices, history] = await Promise.all([
    listSupplierItems(supplierId),
    getSupplierItemPrices(supplierId),
    getSupplierSuggestions(supplierId),
  ]);

  const associated: AssociatedSuggestion[] = items
    // Идэвхгүй болсон барааг санал болгохгүй.
    .filter((item) => item.isActive)
    .map((item) => {
      const key = item.kind === "rawMaterial" ? `rm:${item.subject.id}` : `pr:${item.subject.id}`;
      const price = prices.get(key);
      return {
        key,
        name: item.name,
        sku: item.sku,
        kind: item.kind,
        lastUnitPrice: price?.unitPrice ?? null,
        lastUnit: price?.unit ?? null,
      };
    });

  // Гараар холбосон барааг түүхийн саналд давхардуулж харуулахгүй.
  const associatedKeys = new Set(associated.map((a) => a.key));
  return {
    associated,
    history: history.filter((h) => !associatedKeys.has(h.key)),
  };
}
