import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getCurrentUser, type SessionUser } from "./session";

/**
 * Эрхийн шалгалт ЗӨВХӨН сервер талд хийгдэнэ.
 * UI дээр товч нуух нь хамгаалалт биш — бүх үйлдэл эндээс шалгагдана.
 */
export class AuthorizationError extends Error {
  constructor(message = "Танд энэ үйлдлийг хийх эрх байхгүй байна.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class AuthenticationError extends Error {
  constructor(message = "Нэвтэрч орно уу.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** Хуудсанд ашиглана — нэвтрээгүй бол /login руу шилжүүлнэ. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePageOwner(): Promise<SessionUser> {
  const user = await requirePageUser();
  if (user.role !== "OWNER") redirect("/dashboard");
  return user;
}

/** Server action-д ашиглана — алдаа шиднэ. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError();
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthorizationError();
  return user;
}

export async function requireOwner(): Promise<SessionUser> {
  return requireRole("OWNER");
}

/** Үйл ажиллагааны бүртгэл — MANAGER бичнэ, OWNER бүгдийг чадна. */
export async function requireOperator(): Promise<SessionUser> {
  return requireRole("OWNER", "MANAGER");
}

export function isOwner(user: SessionUser | null | undefined): boolean {
  return user?.role === "OWNER";
}
