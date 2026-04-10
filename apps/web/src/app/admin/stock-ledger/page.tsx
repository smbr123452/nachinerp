import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import StockLedgerClient from "./StockLedgerClient";

export default async function StockLedgerPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");
  const canRead = hasPermission(auth, "inventory.ledger.read");
  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Хөдөлгөөний түүх харах эрх алга.</p>
      </div>
    );
  }
  return <StockLedgerClient />;
}

