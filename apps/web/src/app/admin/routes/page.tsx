import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import RoutesClient from "./RoutesClient";

export default async function RoutesPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");
  const canRead = hasPermission(auth, "route.read");
  const canManage = hasPermission(auth, "route.manage");
  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Маршрут харах эрх алга.</p>
      </div>
    );
  }
  return <RoutesClient canManage={canManage} />;
}

