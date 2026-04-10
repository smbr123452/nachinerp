import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import StockBalancesClient from "./StockBalancesClient";

export default async function StockBalancesPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");
  const canRead = hasPermission(auth, "inventory.balances.read");
  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Үлдэгдэл харах эрх алга.</p>
      </div>
    );
  }
  return <StockBalancesClient />;
}

