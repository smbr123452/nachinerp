import { Badge } from "@/components/ui/Badge";
import { EmptyRow, MonoText, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ACCOUNT_LABEL, MONEY_TYPE_LABEL } from "@/server/services/money";
import type { LedgerRow } from "@/server/services/money-analytics";

/** Гүйлгээний эх баримт руу очих холбоос — байгаа хуудсуудыг ашиглана. */
function referenceHref(row: LedgerRow): string | null {
  if (!row.referenceId) return null;
  switch (row.referenceType) {
    case "SALE":
    case "SALE_CANCEL":
      return `/sales/${row.referenceId}`;
    case "PURCHASE":
    case "PURCHASE_CANCEL":
      return `/purchases/${row.referenceId}`;
    case "EXPENSE":
    case "EXPENSE_CANCEL":
      return "/expenses";
    default:
      return null;
  }
}

/**
 * MoneyTransaction-д "status" талбар БАЙХГҮЙ: дэвтрийн мөр бүр аль
 * хэдийн болсон баримт. Цуцлалт нь эсрэг бичилтээр ордог тул
 * төлвийг эх баримтын төрлөөс нь гаргана — зохиомол утга үүсгэхгүй.
 */
function entryState(row: LedgerRow): { label: string; tone: "neutral" | "warning" } {
  return row.referenceType.endsWith("_CANCEL")
    ? { label: "Цуцлалтын бичилт", tone: "warning" }
    : { label: "Батлагдсан", tone: "neutral" };
}

const REFERENCE_LABEL: Record<string, string> = {
  SALE: "Борлуулалт",
  SALE_CANCEL: "Борлуулалт (цуцлалт)",
  PURCHASE: "Худалдан авалт",
  PURCHASE_CANCEL: "Худалдан авалт (цуцлалт)",
  EXPENSE: "Зардал",
  EXPENSE_CANCEL: "Зардал (цуцлалт)",
  BANK_DEPOSIT: "Банкны тушаалт",
  ADJUSTMENT: "Тохируулга",
};

/**
 * Мөнгөн гүйлгээний дэвтэр. Орлого / зарлага тусдаа баганад,
 * мөнгөн багана баруун тийш эгнэнэ.
 */
export function LedgerTable({ rows, emptyText }: { rows: LedgerRow[]; emptyText?: string }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th width="110px">Огноо</Th>
          <Th>Гүйлгээний төрөл</Th>
          <Th>Тайлбар</Th>
          <Th align="right" width="130px">
            Орлого
          </Th>
          <Th align="right" width="130px">
            Зарлага
          </Th>
          <Th width="110px">Данс</Th>
          <Th width="150px">Reference</Th>
          <Th width="150px">Бүртгэсэн</Th>
          <Th width="130px">Төлөв</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={9}>{emptyText ?? "Гүйлгээ олдсонгүй."}</EmptyRow>
        ) : (
          rows.map((row) => {
            const href = referenceHref(row);
            const isTransfer = row.direction === "TRANSFER";
            const state = entryState(row);
            return (
              <Tr key={row.id}>
                <Td muted className="whitespace-nowrap">
                  {formatDate(row.occurredAt)}
                </Td>
                <Td className="font-medium text-ink-800">{MONEY_TYPE_LABEL[row.type]}</Td>
                <Td muted className="max-w-[18rem]">
                  <span className="block truncate">{row.note ?? "—"}</span>
                </Td>
                <Td align="right" className="font-medium text-emerald-700">
                  {row.direction === "IN" ? formatMoney(row.amount) : ""}
                </Td>
                <Td align="right" className="font-medium text-red-700">
                  {row.direction === "OUT" ? formatMoney(row.amount) : ""}
                </Td>
                <Td>
                  {isTransfer ? (
                    <span className="flex items-center gap-1 whitespace-nowrap text-[12px] text-ink-600">
                      {ACCOUNT_LABEL[row.sourceAccount!]}
                      <span aria-hidden className="text-ink-400">
                        →
                      </span>
                      {ACCOUNT_LABEL[row.destinationAccount!]}
                    </span>
                  ) : (
                    <Badge tone={row.direction === "IN" ? "success" : "danger"}>
                      {ACCOUNT_LABEL[(row.destinationAccount ?? row.sourceAccount)!]}
                    </Badge>
                  )}
                </Td>
                <Td>
                  {href ? (
                    <TableLink href={href}>{REFERENCE_LABEL[row.referenceType] ?? row.referenceType}</TableLink>
                  ) : (
                    <MonoText>{REFERENCE_LABEL[row.referenceType] ?? row.referenceType}</MonoText>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-400">
                  {row.createdByName}
                  <br />
                  {formatDateTime(row.createdAt)}
                </Td>
                <Td>
                  <Badge tone={state.tone}>{state.label}</Badge>
                </Td>
              </Tr>
            );
          })
        )}
      </tbody>
    </Table>
  );
}
