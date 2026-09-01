import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "nachin_session";

/**
 * Хурдан шүүлт: cookie байхгүй бол нэвтрэх хуудас руу.
 * Жинхэнэ эрхийн шалгалт нь хуудас/үйлдэл бүр дээр сервер талд хийгдэнэ.
 */
const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && !PUBLIC_PATHS.includes(pathname)) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/materials/:path*",
    "/products/:path*",
    "/purchases/:path*",
    "/sales/:path*",
    "/expenses/:path*",
    "/counts/:path*",
    "/money/:path*",
    "/reports/:path*",
    "/audit/:path*",
    "/settings/:path*",
  ],
};
