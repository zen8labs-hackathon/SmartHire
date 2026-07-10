import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isProfileStaff } from "@/lib/admin/config";
import { getSupabasePublishableKey } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublishableKey();
  const path = request.nextUrl.pathname;

  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const needsAuthCheck =
    path === "/signup" || path.startsWith("/admin") || path.startsWith("/dashboard");

  // Avoid a network call on public routes to keep local dev responsive.
  if (!needsAuthCheck) {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (path === "/signup") {
    if (user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      return NextResponse.redirect(redirectUrl);
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("reason", "no-signup");
    return NextResponse.redirect(redirectUrl);
  }

  if (path.startsWith("/admin")) {
    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", "/admin");
      return NextResponse.redirect(redirectUrl);
    }
    if (!(await isProfileStaff(supabase, user.id, user))) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (path.startsWith("/dashboard") && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
