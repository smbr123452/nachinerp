import { NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { verifyPassword } from "@/core/auth/password";
import { createSession, setSessionCookie } from "@/core/auth/session";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return NextResponse.redirect(new URL("/login?error=missing", request.url));
  }

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user || !user.isActive) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }

  const isPasswordCorrect = await verifyPassword(password, user.passwordHash);
  if (!isPasswordCorrect) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }

  const token = await createSession(user.id);
  await setSessionCookie(token);

  return NextResponse.redirect(new URL("/admin", request.url));
}

