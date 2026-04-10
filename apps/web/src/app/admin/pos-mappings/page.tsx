import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import PosMappingsClient from "./PosMappingsClient";

export default async function PosMappingsPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");
  const canRead = hasPermission(auth, "pos.mapping.read");
  const canWrite = hasPermission(auth, "pos.mapping.write");
  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">POS mapping харах эрх алга.</p>
      </div>
    );
  }
  return <PosMappingsClient canWrite={canWrite} />;
}

