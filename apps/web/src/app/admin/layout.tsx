import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getCurrentAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const canReadUsers = hasPermission(auth, "admin.users.read");
  const canReadRoles = hasPermission(auth, "admin.roles.read");
  const canReadMasterData = hasPermission(auth, "admin.masterdata.read");
  const canReadLedger = hasPermission(auth, "inventory.ledger.read");
  const canReadBalances = hasPermission(auth, "inventory.balances.read");
  const canReadAdjustments = hasPermission(auth, "inventory.adjustment.read");
  const canReadRecipes = hasPermission(auth, "production.recipe.read");
  const canReadProductionOrders = hasPermission(auth, "production.order.read");
  const canReadPosImport = hasPermission(auth, "pos.import.read");
  const canReadPosMapping = hasPermission(auth, "pos.mapping.read");
  const canReadRoutes = hasPermission(auth, "route.read");

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-lg font-semibold">Админ хэсэг</p>
            <p className="text-sm text-neutral-600">{auth.user.fullName}</p>
          </div>
          <form method="post" action="/api/auth/logout">
            <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
              Гарах
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[220px_1fr]">
        <aside className="rounded border bg-white p-3">
          <nav className="space-y-2 text-sm">
            <Link href="/admin" className="block rounded px-2 py-1 hover:bg-neutral-100">
              Ерөнхий
            </Link>
            {canReadUsers ? (
              <Link href="/admin/users" className="block rounded px-2 py-1 hover:bg-neutral-100">
                Хэрэглэгчид
              </Link>
            ) : null}
            {canReadRoles ? (
              <Link href="/admin/roles" className="block rounded px-2 py-1 hover:bg-neutral-100">
                Role ба эрхүүд
              </Link>
            ) : null}
            {canReadMasterData ? (
              <>
                <Link href="/admin/branches" className="block rounded px-2 py-1 hover:bg-neutral-100">
                  Салбарууд
                </Link>
                <Link href="/admin/warehouses" className="block rounded px-2 py-1 hover:bg-neutral-100">
                  Складууд
                </Link>
                <Link href="/admin/products" className="block rounded px-2 py-1 hover:bg-neutral-100">
                  Бүтээгдэхүүн
                </Link>
              </>
            ) : null}
            {canReadLedger ? (
              <>
                <Link href="/admin/inventory-receiving" className="block rounded px-2 py-1 hover:bg-neutral-100">
                  Орлого бүртгэл
                </Link>
                <Link href="/admin/stock-ledger" className="block rounded px-2 py-1 hover:bg-neutral-100">
                  Хөдөлгөөний түүх
                </Link>
                <Link href="/admin/stock-transfers" className="block rounded px-2 py-1 hover:bg-neutral-100">
                  Шилжүүлэг
                </Link>
              </>
            ) : null}
            {canReadBalances ? (
              <Link href="/admin/stock-balances" className="block rounded px-2 py-1 hover:bg-neutral-100">
                Үлдэгдэл
              </Link>
            ) : null}
            {canReadAdjustments ? (
              <>
                <Link href="/admin/stock-counts" className="block rounded px-2 py-1 hover:bg-neutral-100">
                  Тооллого
                </Link>
                <Link href="/admin/stock-adjustments" className="block rounded px-2 py-1 hover:bg-neutral-100">
                  Тохируулга
                </Link>
              </>
            ) : null}
            {canReadRecipes ? (
              <Link href="/admin/recipes" className="block rounded px-2 py-1 hover:bg-neutral-100">
                Жор (BOM)
              </Link>
            ) : null}
            {canReadProductionOrders ? (
              <Link href="/admin/production-orders" className="block rounded px-2 py-1 hover:bg-neutral-100">
                Үйлдвэрлэлийн захиалга
              </Link>
            ) : null}
            {canReadPosImport ? (
              <Link href="/admin/pos-import" className="block rounded px-2 py-1 hover:bg-neutral-100">
                POS импорт
              </Link>
            ) : null}
            {canReadPosMapping ? (
              <Link href="/admin/pos-mappings" className="block rounded px-2 py-1 hover:bg-neutral-100">
                POS mappings
              </Link>
            ) : null}
            {canReadRoutes ? (
              <>
                <Link href="/admin/routes" className="block rounded px-2 py-1 hover:bg-neutral-100">
                  Маршрут
                </Link>
                <Link href="/admin/delivery-runs" className="block rounded px-2 py-1 hover:bg-neutral-100">
                  Delivery run
                </Link>
              </>
            ) : null}
          </nav>
        </aside>
        <section>{children}</section>
      </div>
    </div>
  );
}

