import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canReadUsers = hasPermission(auth, "admin.users.read");
  const canWriteUsers = hasPermission(auth, "admin.users.write");
  if (!canReadUsers) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Хэрэглэгчийн модуль харах эрх танд алга.</p>
      </div>
    );
  }

  return <UsersClient canWriteUsers={canWriteUsers} />;
}

