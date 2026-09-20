import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { localeCookieName, selectLocale } from "./i18n/routing";

export function proxy(request: NextRequest): NextResponse {
  const locale = selectLocale(
    request.cookies.get(localeCookieName)?.value,
    request.headers.get("accept-language"),
  );
  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}

export const config = { matcher: "/" };
