import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader, StatCard } from "@/components/ui/Card";
import { CancelDocumentButton } from "@/components/ui/ConfirmAction";
import { EmptyRow, Table, Td, Th } from "@/components/ui/Table";
import { DateFilter, FilterBar, FilterSelect } from "@/components/ui/SearchFilters";
import { requirePageUser } from "@/lib/auth/guards";
import { sum } from "@/lib/decimal";
import { formatDate, formatMoney, toDateInput } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseDateInput, startOfLocalMonth } from "@/lib/dates";
import { ACCOUNT_LABEL } from "@/server/services/money";
import { cancelExpenseAction } from "./actions";
import { NewExpenseButton, NewExpenseCategoryButton, ToggleCategoryButton } from "./ExpensesClient";

export const metadata = { title: "Зардал | Начин ERP" };

type SearchParams = Promise<{ from?: string; to?: string; category?: string; status?: string }>;

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const params = await searchParams;

  const where: Prisma.ExpenseWhereInput = {};
  if (params.from || params.to) {
    where.date = {};
    if (params.from) where.date.gte = parseDateInput(params.from);
    if (params.to) where.date.lt = new Date(parseDateInput(params.to).getTime() + 86400000);
  }
  if (params.category) where.categoryId = params.category;
  if (params.status === "cancelled") where.status = "CANCELLED";
  else if (params.status === "posted") where.status = "POSTED";

  const [expenses, categories, monthAggregate] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: { category: true, createdBy: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.expense.aggregate({
      where: { status: "POSTED", date: { gte: startOfLocalMonth() } },
      _sum: { amount: true },
    }),
  ]);

  const listedTotal = sum(expenses.filter((e) => e.status === "POSTED").map((e) => e.amount));
  const activeCategories = categories.filter((c) => c.isActive);

  return (
    <>
      <PageHeader
        title="Зардал"
        description="Нөөцөд нөлөөлдөггүй бусад зардлын бүртгэл"
        action={
          <>
            {user.role === "OWNER" ? <NewExpenseCategoryButton /> : null}
            <NewExpenseButton categories={activeCategories} today={toDateInput(new Date())} />
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Энэ сарын зардал" value={formatMoney(monthAggregate._sum.amount ?? 0)} />
        <StatCard label="Шүүлтэд харагдаж буй дүн" value={formatMoney(listedTotal)} />
      </div>

      <FilterBar>
        <DateFilter paramKey="from" label="Эхлэх огноо" />
        <DateFilter paramKey="to" label="Дуусах огноо" />
        <FilterSelect
          paramKey="category"
          label="Ангилал"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <FilterSelect
          paramKey="status"
          label="Төлөв"
          options={[
            { value: "posted", label: "Батлагдсан" },
            { value: "cancelled", label: "Цуцалсан" },
          ]}
        />
      </FilterBar>

      <Card className="mb-6">
        <Table>
          <thead>
            <tr>
              <Th>Огноо</Th>
              <Th>Ангилал</Th>
              <Th>Тайлбар</Th>
              <Th>Данс</Th>
              <Th align="right">Дүн</Th>
              <Th>Төлөв</Th>
              <Th>Бүртгэсэн</Th>
              <Th align="right">Үйлдэл</Th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <EmptyRow colSpan={8}>Зардал бүртгэгдээгүй байна.</EmptyRow>
            ) : (
              expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-slate-50">
                  <Td>{formatDate(expense.date)}</Td>
                  <Td className="font-medium">{expense.category.name}</Td>
                  <Td className="text-slate-500">
                    {expense.description ?? "-"}
                    {expense.receiptUrl ? (
                      <a
                        href={expense.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-xs text-brand-600 hover:underline"
                      >
                        Баримт
                      </a>
                    ) : null}
                  </Td>
                  <Td className="text-slate-500">{ACCOUNT_LABEL[expense.account]}</Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(expense.amount)}
                  </Td>
                  <Td>
                    <StatusBadge status={expense.status} />
                  </Td>
                  <Td className="text-slate-500">{expense.createdBy.name}</Td>
                  <Td align="right">
                    {expense.status === "POSTED" ? (
                      <CancelDocumentButton
                        id={expense.id}
                        action={cancelExpenseAction}
                        title="Зардал цуцлах"
                        description="Мөнгөн гүйлгээ буцаагдаж, бичлэг түүхэнд үлдэнэ."
                      />
                    ) : (
                      <span className="text-xs text-slate-400">{expense.cancelNote ?? "-"}</span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title="Зардлын ангилал"
          description={user.role === "OWNER" ? "Ангиллыг эзэн удирдана." : "Зөвхөн эзэн ангилал нэмнэ."}
        />
        <Table>
          <thead>
            <tr>
              <Th>Нэр</Th>
              <Th>Төлөв</Th>
              <Th align="right">Үйлдэл</Th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <EmptyRow colSpan={3}>Ангилал бүртгэгдээгүй байна.</EmptyRow>
            ) : (
              categories.map((category) => (
                <tr key={category.id}>
                  <Td>{category.name}</Td>
                  <Td>
                    {category.isActive ? (
                      <Badge tone="success">Идэвхтэй</Badge>
                    ) : (
                      <Badge tone="neutral">Идэвхгүй</Badge>
                    )}
                  </Td>
                  <Td align="right">
                    {user.role === "OWNER" ? (
                      <ToggleCategoryButton id={category.id} isActive={category.isActive} />
                    ) : null}
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
