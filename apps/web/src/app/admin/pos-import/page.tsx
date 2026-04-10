import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import PosImportClient from "./PosImportClient";

export default async function PosImportPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canRead = hasPermission(auth, "pos.import.read");
  const canRun = hasPermission(auth, "pos.import.run");

  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">POS импорт харах эрх алга.</p>
      </div>
    );
  }

  return <PosImportClient canRun={canRun} />;
}

