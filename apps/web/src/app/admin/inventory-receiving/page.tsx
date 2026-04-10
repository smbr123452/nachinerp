import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import InventoryReceivingClient from "./InventoryReceivingClient";

export default async function InventoryReceivingPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canRead = hasPermission(auth, "inventory.ledger.read");
  const canCreate = hasPermission(auth, "inventory.receiving.create");
  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Орлогын мэдээлэл харах эрх алга.</p>
      </div>
    );
  }

  return <InventoryReceivingClient canCreate={canCreate} />;
}

