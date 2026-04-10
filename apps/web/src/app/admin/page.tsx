import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";

export default async function AdminHomePage() {
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
    <div className="space-y-4 rounded border bg-white p-5">
      <h1 className="text-xl font-semibold">Админ самбар</h1>
      <p className="text-sm text-neutral-600">Тавтай морил, {auth.user.fullName}.</p>
      <div className="flex flex-wrap gap-2">
        {canReadUsers ? (
          <Link href="/admin/users" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
            Хэрэглэгч удирдах
          </Link>
        ) : null}
        {canReadRoles ? (
          <Link href="/admin/roles" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
            Role болон эрх удирдах
          </Link>
        ) : null}
        {canReadMasterData ? (
          <>
            <Link href="/admin/branches" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              Салбар удирдах
            </Link>
            <Link href="/admin/warehouses" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              Склад удирдах
            </Link>
            <Link href="/admin/products" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              Бүтээгдэхүүн удирдах
            </Link>
          </>
        ) : null}
        {canReadLedger ? (
          <>
            <Link href="/admin/inventory-receiving" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              Орлого бүртгэл
            </Link>
            <Link href="/admin/stock-ledger" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              Хөдөлгөөний түүх
            </Link>
            <Link href="/admin/stock-transfers" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              Шилжүүлэг
            </Link>
          </>
        ) : null}
        {canReadBalances ? (
          <Link href="/admin/stock-balances" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
            Үлдэгдэл
          </Link>
        ) : null}
        {canReadAdjustments ? (
          <>
            <Link href="/admin/stock-counts" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              Тооллого
            </Link>
            <Link href="/admin/stock-adjustments" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              Тохируулга
            </Link>
          </>
        ) : null}
        {canReadRecipes ? (
          <Link href="/admin/recipes" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
            Жор (BOM)
          </Link>
        ) : null}
        {canReadProductionOrders ? (
          <Link href="/admin/production-orders" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
            Үйлдвэрлэлийн захиалга
          </Link>
        ) : null}
        {canReadPosImport ? (
          <Link href="/admin/pos-import" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
            POS импорт
          </Link>
        ) : null}
        {canReadPosMapping ? (
          <Link href="/admin/pos-mappings" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
            POS mappings
          </Link>
        ) : null}
        {canReadRoutes ? (
          <>
            <Link href="/admin/routes" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              Маршрут
            </Link>
            <Link href="/admin/delivery-runs" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              Delivery run
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}

