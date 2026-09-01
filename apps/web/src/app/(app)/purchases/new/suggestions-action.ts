"use server";

import { requireOperator } from "@/lib/auth/guards";
import {
  getSupplierSuggestions,
  type SupplierSuggestion,
} from "@/server/services/supplier-history";

/**
 * Нийлүүлэгч сонгоход түүнээс өмнө авч байсан барааг санал болгоно.
 *
 * Санал нь формд АВТОМАТААР нэмэгдэхгүй — хэрэглэгч сонгож нэмнэ.
 * Бүх өгөгдөл нь батлагдсан худалдан авалтын түүхээс гарна.
 */
export async function fetchSupplierSuggestionsAction(
  supplierId: string,
): Promise<SupplierSuggestion[]> {
  await requireOperator();
  if (!supplierId) return [];
  return getSupplierSuggestions(supplierId);
}
