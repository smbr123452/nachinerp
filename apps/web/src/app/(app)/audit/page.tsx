import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyRow, Table, Td, Th } from "@/components/ui/Table";
import { DateFilter, FilterBar, FilterSelect, SearchInput } from "@/components/ui/SearchFilters";
import { requirePageUser } from "@/lib/auth/guards";
import { AUDIT_ACTION_LABEL } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseDateInput } from "@/lib/dates";

export const metadata = { title: "Audit Log | Начин ERP" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; action?: string; user?: string; from?: string; to?: string }>;

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser();
  const params = await searchParams;

  const where: Prisma.AuditLogWhereInput = {};
  if (params.action) where.action = params.action;
  if (params.user) where.userId = params.user;
  if (params.q) {
    where.OR = [
      { entityType: { contains: params.q, mode: "insensitive" } },
      { entityId: { contains: params.q, mode: "insensitive" } },
      { note: { contains: params.q, mode: "insensitive" } },
    ];
  }
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = parseDateInput(params.from);
    if (params.to) where.createdAt.lt = new Date(parseDateInput(params.to).getTime() + 86400000);
  }

  const [logs, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Бүх чухал үйлдлийн өөрчлөгдөшгүй түүх. Сүүлийн 200 бичлэг."
      />

      <FilterBar>
        <SearchInput placeholder="Бүртгэл эсвэл тайлбар" />
        <FilterSelect
          paramKey="action"
          label="Үйлдэл"
          options={Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          paramKey="user"
          label="Хэрэглэгч"
          options={users.map((u) => ({ value: u.id, label: u.name }))}
        />
        <DateFilter paramKey="from" label="Эхлэх огноо" />
        <DateFilter paramKey="to" label="Дуусах огноо" />
      </FilterBar>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Огноо</Th>
              <Th>Хэрэглэгч</Th>
              <Th>Үйлдэл</Th>
              <Th>Бүртгэл</Th>
              <Th>Тайлбар</Th>
              <Th>Дэлгэрэнгүй</Th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <EmptyRow colSpan={6}>Бичлэг олдсонгүй.</EmptyRow>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="align-top hover:bg-slate-50">
                  <Td className="whitespace-nowrap">{formatDateTime(log.createdAt)}</Td>
                  <Td>{log.user?.name ?? "—"}</Td>
                  <Td className="font-medium">{AUDIT_ACTION_LABEL[log.action] ?? log.action}</Td>
                  <Td className="text-slate-500">
                    {log.entityType}
                    {log.entityId ? (
                      <span className="ml-1 font-mono text-xs text-slate-400">{log.entityId.slice(-6)}</span>
                    ) : null}
                  </Td>
                  <Td className="max-w-xs text-slate-500">{log.note ?? "-"}</Td>
                  <Td>
                    {log.oldValue || log.newValue ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-brand-600">Харах</summary>
                        <pre className="mt-2 max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                          {JSON.stringify({ өмнө: log.oldValue, дараа: log.newValue }, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
