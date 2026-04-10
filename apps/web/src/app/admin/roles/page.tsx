import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import RolesClient from "./RolesClient";

export default async function RolesPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canReadRoles = hasPermission(auth, "admin.roles.read");
  const canWriteRoles = hasPermission(auth, "admin.roles.write");
  if (!canReadRoles) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Role модуль харах эрх танд алга.</p>
      </div>
    );
  }

  return <RolesClient canWriteRoles={canWriteRoles} />;
}

