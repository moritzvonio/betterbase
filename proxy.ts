import { NextResponse, type NextRequest } from "next/server";

// /upgrade ist während der offenen Beta eine öffentliche Infoseite; kommt mit
// dem Pricing zurück in die geschützten Routen (FREE_BETA in lib/entitlement).
const PROTECTED_PREFIXES = ["/leagues", "/league", "/account"];
const SESSION_COOKIE = "bb_session";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  const session = req.cookies.get(SESSION_COOKIE);
  if (!session?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/leagues/:path*", "/league/:path*", "/account/:path*"],
};
