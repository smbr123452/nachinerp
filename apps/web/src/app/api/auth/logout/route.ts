import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearSessionCookie, deleteSessionByToken, SESSION_COOKIE_NAME } from "@/core/auth/session";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await deleteSessionByToken(token);
  }

  await clearSessionCookie();
  return NextResponse.redirect(new URL("/login", request.url));
}

