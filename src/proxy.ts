import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/tr/hizmetler") {
    const url = request.nextUrl.clone();
    url.pathname = "/tr/services";
    return NextResponse.rewrite(url);
  }

  if (request.nextUrl.pathname === "/tr/services") {
    const url = request.nextUrl.clone();
    url.pathname = "/tr/hizmetler";
    return NextResponse.redirect(url, 308);
  }

  const response = intlMiddleware(request);
  // Article metadata resolves published translations, including their actual slugs.
  // next-intl otherwise advertises the same slug in every locale, even for missing posts.
  if (/^\/(?:en\/|tr\/)?blog\/[^/]+\/?$/.test(request.nextUrl.pathname)) {
    response.headers.delete("link");
  }
  return response;
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
