import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import ProductsClient from "./ProductsClient";

export default async function ProductsPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canRead = hasPermission(auth, "admin.masterdata.read");
  const canWrite = hasPermission(auth, "admin.masterdata.write");

  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Бүтээгдэхүүний модуль харах эрх танд алга.</p>
      </div>
    );
  }

  return <ProductsClient canWrite={canWrite} />;
}

