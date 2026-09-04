import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActiveBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyRow, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/SearchFilters";
import { requirePageUser } from "@/lib/auth/guards";
import { formatDate } from "@/lib/format";
import { listSuppliers } from "@/server/services/suppliers";
import { NewSupplierButton } from "./SuppliersClient";

export const metadata = { title: "Нийлүүлэгчид" };

type SearchParams = Promise<{ q?: string; status?: string }>;

export default async function SuppliersPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser();
  const params = await searchParams;

  const suppliers = await listSuppliers({
    query: params.q,
    status: params.status === "active" || params.status === "inactive" ? params.status : undefined,
  });

  const activeCount = suppliers.filter((s) => s.isActive).length;

  return (
    <>
      <PageHeader
        backHref="/purchases"
        title="Нийлүүлэгчид"
        description={`Нийт ${suppliers.length} нийлүүлэгч · идэвхтэй ${activeCount}`}
        action={<NewSupplierButton />}
      />

      <FilterBar>
        <SearchInput placeholder="Нэр, утас, холбоо барих хүн" />
        <FilterSelect
          paramKey="status"
          label="Төлөв"
          options={[
            { value: "active", label: "Идэвхтэй" },
            { value: "inactive", label: "Идэвхгүй" },
          ]}
        />
      </FilterBar>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Нийлүүлэгч</Th>
              <Th>Утас</Th>
              <Th>Холбоо барих хүн</Th>
              <Th align="right">Авагддаг бараа</Th>
              <Th>Сүүлийн худалдан авалт</Th>
              <Th>Төлөв</Th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? (
              <EmptyRow colSpan={6}>Нийлүүлэгч олдсонгүй.</EmptyRow>
            ) : (
              suppliers.map((supplier) => (
                <Tr key={supplier.id}>
                  <Td>
                    <TableLink href={`/purchases/suppliers/${supplier.id}`} strong>
                      {supplier.name}
                    </TableLink>
                  </Td>
                  <Td className="text-ink-500">{supplier.phone ?? "—"}</Td>
                  <Td className="text-ink-500">{supplier.contactPerson ?? "—"}</Td>
                  <Td align="right">{supplier.itemCount > 0 ? supplier.itemCount : "—"}</Td>
                  <Td className="text-ink-500">
                    {supplier.lastPurchaseDate ? formatDate(supplier.lastPurchaseDate) : "—"}
                  </Td>
                  <Td>
                    <ActiveBadge active={supplier.isActive} />
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <p className="mt-4 text-body text-ink-500">
        Нийлүүлэгч дээр дарж дэлгэрэнгүй, эндээс авдаг бараа болон сүүлийн авсан үнийг харна.{" "}
        <Link href="/purchases/new" className="text-brand-600 underline-offset-4 hover:underline">
          Шинэ худалдан авалт бүртгэх
        </Link>
      </p>
    </>
  );
}
