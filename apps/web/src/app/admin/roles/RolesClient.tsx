"use client";

import { useEffect, useState } from "react";

type Permission = { id: string; code: string; module: string; action: string; description?: string | null };
type Role = { id: string; code: string; nameMn: string; description?: string | null; permissions: { id: string; code: string }[] };

export default function RolesClient({ canWriteRoles }: { canWriteRoles: boolean }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState("");
  const [newRole, setNewRole] = useState({ code: "", nameMn: "", description: "", permissionIds: [] as string[] });

  async function loadData() {
    setError("");
    const res = await fetch("/api/admin/roles");
    if (!res.ok) {
      const data = await res.json();
      setError(data.message ?? "Role мэдээлэл ачаалж чадсангүй.");
      return;
    }
    const data = await res.json();
    setRoles(data.roles ?? []);
    setPermissions(data.permissions ?? []);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createRole() {
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRole),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.message ?? "Role үүсгэхэд алдаа гарлаа.");
      return;
    }
    setNewRole({ code: "", nameMn: "", description: "", permissionIds: [] });
    await loadData();
  }

  async function deleteRole(roleId: string) {
    const res = await fetch("/api/admin/roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.message ?? "Role устгахад алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Role ба эрхүүд</h1>
        <p className="mt-1 text-sm text-neutral-600">Role үүсгэх, эрхүүд оноох.</p>
        {error ? <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <input placeholder="Role code (ж: OPS_ADMIN)" className="rounded border px-3 py-2 text-sm" value={newRole.code} onChange={(e) => setNewRole((s) => ({ ...s, code: e.target.value.toUpperCase() }))} />
          <input placeholder="Role нэр (Монгол)" className="rounded border px-3 py-2 text-sm" value={newRole.nameMn} onChange={(e) => setNewRole((s) => ({ ...s, nameMn: e.target.value }))} />
          <input placeholder="Тайлбар" className="rounded border px-3 py-2 text-sm" value={newRole.description} onChange={(e) => setNewRole((s) => ({ ...s, description: e.target.value }))} />
        </div>

        <div className="mt-3 rounded border p-3">
          <p className="mb-2 text-sm font-medium">Оноох эрхүүд</p>
          <div className="grid gap-2 md:grid-cols-2">
            {permissions.map((perm) => {
              const checked = newRole.permissionIds.includes(perm.id);
              return (
                <label key={perm.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked ? [...newRole.permissionIds, perm.id] : newRole.permissionIds.filter((id) => id !== perm.id);
                      setNewRole((s) => ({ ...s, permissionIds: next }));
                    }}
                  />
                  <span>{perm.code}</span>
                </label>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => void createRole()}
          disabled={!canWriteRoles}
          className="mt-3 rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Role үүсгэх
        </button>
      </section>

      <section className="space-y-3 rounded border bg-white p-5">
        {roles.map((role) => (
          <div key={role.id} className="rounded border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  {role.nameMn} <span className="text-neutral-500">({role.code})</span>
                </p>
                {role.description ? <p className="text-xs text-neutral-600">{role.description}</p> : null}
              </div>
              <button
                onClick={() => void deleteRole(role.id)}
                disabled={!canWriteRoles}
                className="rounded border border-red-300 px-2 py-1 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Устгах
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-600">Эрхүүд: {role.permissions.map((p) => p.code).join(", ") || "Одоогоор оноогоогүй"}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

