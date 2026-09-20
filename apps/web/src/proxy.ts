import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { localeCookieName, selectLocale } from "./i18n/routing";

export function proxy(request: NextRequest): NextResponse {
  const routeLocale = request.nextUrl.pathname.slice(1);
  if (routeLocale === "de" || routeLocale === "en") {
    const response = NextResponse.next();
    response.cookies.set(localeCookieName, routeLocale, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return response;
  }

  const locale = selectLocale(
    request.cookies.get(localeCookieName)?.value,
    request.headers.get("accept-language"),
  );
  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}

export const config = { matcher: ["/", "/:locale(de|en)"] };
