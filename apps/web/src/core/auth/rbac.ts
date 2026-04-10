import { NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { getCurrentSessionToken } from "@/core/auth/session";

export type AuthContext = {
  user: {
    id: string;
    username: string;
    fullName: string;
  };
  permissions: string[];
};

export async function getCurrentAuthContext(): Promise<AuthContext | null> {
  const token = await getCurrentSessionToken();
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (!session.user.isActive) return null;

  const permissionSet = new Set<string>();
  for (const userRole of session.user.roles) {
    for (const rolePerm of userRole.role.permissions) {
      permissionSet.add(rolePerm.permission.code);
    }
  }

  return {
    user: {
      id: session.user.id,
      username: session.user.username,
      fullName: session.user.fullName,
    },
    permissions: Array.from(permissionSet),
  };
}

export function hasPermission(auth: AuthContext | null, permissionCode: string): boolean {
  if (!auth) return false;
  return auth.permissions.includes(permissionCode);
}

export async function requirePermission(permissionCode: string): Promise<AuthContext | NextResponse> {
  const auth = await getCurrentAuthContext();
  if (!auth) {
    return NextResponse.json({ message: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }

  if (!hasPermission(auth, permissionCode)) {
    return NextResponse.json({ message: "Энэ үйлдэлд эрх хүрэхгүй байна." }, { status: 403 });
  }

  return auth;
}

