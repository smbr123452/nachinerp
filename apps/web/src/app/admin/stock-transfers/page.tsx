import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import StockTransfersClient from "./StockTransfersClient";

export default async function StockTransfersPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canCreate = hasPermission(auth, "inventory.transfer.create");
  const canApprove = hasPermission(auth, "inventory.transfer.approve");
  const canReceive = hasPermission(auth, "inventory.transfer.receive");
  const canRead = hasPermission(auth, "inventory.ledger.read") || canCreate || canApprove || canReceive;

  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Шилжүүлгийн мэдээлэл харах эрх алга.</p>
      </div>
    );
  }

  return <StockTransfersClient canCreate={canCreate} canApprove={canApprove} canReceive={canReceive} />;
}

