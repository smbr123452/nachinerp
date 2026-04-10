import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import StockAdjustmentsClient from "./StockAdjustmentsClient";

export default async function StockAdjustmentsPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canRead = hasPermission(auth, "inventory.adjustment.read");
  const canApprove = hasPermission(auth, "inventory.adjustment.approve");

  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Тохируулга харах эрх алга.</p>
      </div>
    );
  }

  return <StockAdjustmentsClient canApprove={canApprove} />;
}

