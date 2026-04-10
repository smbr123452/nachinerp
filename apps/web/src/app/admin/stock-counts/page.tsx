import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import StockCountsClient from "./StockCountsClient";

export default async function StockCountsPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canRead = hasPermission(auth, "inventory.adjustment.read");
  const canCreate = hasPermission(auth, "inventory.count.create");
  const canSubmit = hasPermission(auth, "inventory.count.submit");
  const canApprove = hasPermission(auth, "inventory.count.approve");

  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Тооллогын мэдээлэл харах эрх алга.</p>
      </div>
    );
  }

  return <StockCountsClient canCreate={canCreate} canSubmit={canSubmit} canApprove={canApprove} />;
}

