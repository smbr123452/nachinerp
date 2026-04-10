"use client";

import { useEffect, useMemo, useState } from "react";

type RoleOption = { id: string; code: string; nameMn: string };
type UserRole = { id?: string; roleId: string; roleCode: string; roleNameMn: string; scopeType: string; scopeId?: string | null };
type User = { id: string; username: string; fullName: string; isActive: boolean; roles: UserRole[] };

export default function UsersClient({ canWriteUsers }: { canWriteUsers: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [newUser, setNewUser] = useState({ username: "", fullName: "", password: "" });
  const [assign, setAssign] = useState<{ [userId: string]: string }>({});

  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.username.localeCompare(b.username)), [users]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [usersRes, rolesRes] = await Promise.all([fetch("/api/admin/users"), fetch("/api/admin/roles")]);
      if (!usersRes.ok) throw new Error("Хэрэглэгчийн мэдээлэл ачаалж чадсангүй.");
      if (!rolesRes.ok) throw new Error("Role мэдээлэл ачаалж чадсангүй.");

      const usersJson = await usersRes.json();
      const rolesJson = await rolesRes.json();

      setUsers(usersJson.users ?? []);
      setRoles((rolesJson.roles ?? []).map((r: { id: string; code: string; nameMn: string }) => ({ id: r.id, code: r.code, nameMn: r.nameMn })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createUser() {
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.message ?? "Хэрэглэгч үүсгэхэд алдаа гарлаа.");
      return;
    }
    setNewUser({ username: "", fullName: "", password: "" });
    await loadData();
  }

  async function updateUser(userId: string, fullName: string, isActive: boolean) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, fullName, isActive }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.message ?? "Хэрэглэгч шинэчлэхэд алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  async function deactivateUser(userId: string) {
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.message ?? "Хэрэглэгч идэвхгүй болгоход алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  async function assignRole(userId: string) {
    const roleId = assign[userId];
    if (!roleId) return;
    const res = await fetch("/api/admin/user-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, roleId, scopeType: "GLOBAL" }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.message ?? "Role онооход алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  async function removeUserRole(userRoleId: string) {
    const res = await fetch("/api/admin/user-roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userRoleId }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.message ?? "Role оноолт хасахад алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хэрэглэгчид</h1>
        <p className="mt-1 text-sm text-neutral-600">Хэрэглэгч үүсгэх, шинэчлэх, идэвхгүй болгох.</p>
        {error ? <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <input placeholder="Хэрэглэгчийн нэр" value={newUser.username} onChange={(e) => setNewUser((s) => ({ ...s, username: e.target.value }))} className="rounded border px-3 py-2 text-sm" />
          <input placeholder="Овог нэр" value={newUser.fullName} onChange={(e) => setNewUser((s) => ({ ...s, fullName: e.target.value }))} className="rounded border px-3 py-2 text-sm" />
          <input placeholder="Нууц үг" type="password" value={newUser.password} onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))} className="rounded border px-3 py-2 text-sm" />
          <button
            onClick={() => void createUser()}
            disabled={!canWriteUsers}
            className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Хэрэглэгч нэмэх
          </button>
        </div>
      </section>

      <section className="rounded border bg-white p-5">
        {loading ? (
          <p className="text-sm text-neutral-600">Ачаалж байна...</p>
        ) : (
          <div className="space-y-3">
            {sortedUsers.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                roles={roles}
                selectedRoleId={assign[user.id] ?? ""}
                onSelectRole={(roleId) => setAssign((s) => ({ ...s, [user.id]: roleId }))}
                onAssign={() => void assignRole(user.id)}
                onUpdate={(fullName, isActive) => void updateUser(user.id, fullName, isActive)}
                onDeactivate={() => void deactivateUser(user.id)}
                onRemoveUserRole={(userRoleId) => void removeUserRole(userRoleId)}
                canWriteUsers={canWriteUsers}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function UserRow({
  user,
  roles,
  selectedRoleId,
  onSelectRole,
  onAssign,
  onUpdate,
  onDeactivate,
  onRemoveUserRole,
  canWriteUsers,
}: {
  user: User;
  roles: RoleOption[];
  selectedRoleId: string;
  onSelectRole: (roleId: string) => void;
  onAssign: () => void;
  onUpdate: (fullName: string, isActive: boolean) => void;
  onDeactivate: () => void;
  onRemoveUserRole: (userRoleId: string) => void;
  canWriteUsers: boolean;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [isActive, setIsActive] = useState(user.isActive);

  useEffect(() => {
    setFullName(user.fullName);
    setIsActive(user.isActive);
  }, [user.fullName, user.isActive]);

  return (
    <div className="rounded border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-40 text-sm font-medium">{user.username}</p>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="rounded border px-2 py-1 text-sm" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Идэвхтэй
        </label>
        <button onClick={() => onUpdate(fullName, isActive)} disabled={!canWriteUsers} className="rounded border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50">
          Шинэчлэх
        </button>
        <button onClick={onDeactivate} disabled={!canWriteUsers} className="rounded border border-red-300 px-2 py-1 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-50">
          Идэвхгүй болгох
        </button>
      </div>
      <div className="mt-2 text-xs text-neutral-600">
        Одоогийн role:{" "}
        {user.roles.length > 0
          ? user.roles.map((r) => (
              <button
                key={r.id ?? r.roleId}
                onClick={() => (r.id ? onRemoveUserRole(r.id) : undefined)}
                disabled={!canWriteUsers}
                className="mr-2 rounded border px-1 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {r.roleNameMn} (x)
              </button>
            ))
          : "Байхгүй"}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select className="rounded border px-2 py-1 text-sm" value={selectedRoleId} onChange={(e) => onSelectRole(e.target.value)}>
          <option value="">Role сонгох</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.nameMn} ({role.code})
            </option>
          ))}
        </select>
        <button onClick={onAssign} disabled={!canWriteUsers} className="rounded border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50">
          Role оноох
        </button>
      </div>
    </div>
  );
}

