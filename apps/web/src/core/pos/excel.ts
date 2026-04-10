import * as XLSX from "xlsx";

export type PosRow = {
  branchName: string;
  receiptNo: string;
  saleDate: string;
  saleTime: string;
  productCode: string;
  productName: string;
  barcode: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isCancelled: string;
  lineSequence: number;
  receiptSequence: number;
  cashierName: string;
  orderType: string;
  productGroup: string;
  productCategory: string;
};

const HEADERS = {
  branchName: "Пос",
  receiptNo: "Дугаар",
  saleDate: "Огноо",
  saleTime: "Цаг:Мин",
  productCode: "Бараа код",
  productName: "Бараа нэр",
  barcode: "Баркод",
  unitPrice: "Нэгж үнэ",
  quantity: "Тоо",
  lineTotal: "Нийт үнэ",
  isCancelled: "Цуцалсан",
  lineSequence: "Бараа дараалал",
  receiptSequence: "Баримт дараалал",
  cashierName: "Ажилтан",
  orderType: "Хаана",
  productGroup: "Бүлэг",
  productCategory: "Ангилал",
} as const;

function asString(v: unknown): string {
  return String(v ?? "").trim();
}

function asNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(v: unknown): string {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }
  const s = asString(v);
  if (!s) return "";
  const date = new Date(s);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return s;
}

export function parsePosExcel(buffer: ArrayBuffer): PosRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  return rows.map((r) => ({
    branchName: asString(r[HEADERS.branchName]),
    receiptNo: asString(r[HEADERS.receiptNo]),
    saleDate: normalizeDate(r[HEADERS.saleDate]),
    saleTime: asString(r[HEADERS.saleTime]),
    productCode: asString(r[HEADERS.productCode]),
    productName: asString(r[HEADERS.productName]),
    barcode: asString(r[HEADERS.barcode]),
    unitPrice: asNumber(r[HEADERS.unitPrice]),
    quantity: asNumber(r[HEADERS.quantity]),
    lineTotal: asNumber(r[HEADERS.lineTotal]),
    isCancelled: asString(r[HEADERS.isCancelled]),
    lineSequence: asNumber(r[HEADERS.lineSequence]),
    receiptSequence: asNumber(r[HEADERS.receiptSequence]),
    cashierName: asString(r[HEADERS.cashierName]),
    orderType: asString(r[HEADERS.orderType]),
    productGroup: asString(r[HEADERS.productGroup]),
    productCategory: asString(r[HEADERS.productCategory]),
  }));
}

export function isCancelledRow(v: string): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "тийм";
}

