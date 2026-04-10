import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import DeliveryRunsClient from "./DeliveryRunsClient";

export default async function DeliveryRunsPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canRead = hasPermission(auth, "route.read");
  const canCreate = hasPermission(auth, "route.run.create");
  const canLoad = hasPermission(auth, "route.run.load");
  const canDeliver = hasPermission(auth, "route.run.deliver");
  const canReturnLoss = hasPermission(auth, "route.run.return_loss");
  const canClose = hasPermission(auth, "route.run.close");

  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Хүргэлтийн run харах эрх алга.</p>
      </div>
    );
  }

  return <DeliveryRunsClient canCreate={canCreate} canLoad={canLoad} canDeliver={canDeliver} canReturnLoss={canReturnLoss} canClose={canClose} />;
}

