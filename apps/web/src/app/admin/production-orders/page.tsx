import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import ProductionOrdersClient from "./ProductionOrdersClient";

export default async function ProductionOrdersPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canRead = hasPermission(auth, "production.order.read");
  const canCreate = hasPermission(auth, "production.order.create");
  const canApprove = hasPermission(auth, "production.order.approve");
  const canExecute = hasPermission(auth, "production.order.execute");

  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Үйлдвэрлэлийн захиалга харах эрх алга.</p>
      </div>
    );
  }

  return <ProductionOrdersClient canCreate={canCreate} canApprove={canApprove} canExecute={canExecute} />;
}

