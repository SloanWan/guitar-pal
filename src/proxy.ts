import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const response = NextResponse.next();

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach(({ name, value, options }) =>
						response.cookies.set(name, value, options),
					);
				},
			},
		},
	);

	// Refresh the session cookie on every matched request. The refreshed cookies
	// live on `response`; when we redirect instead, copy them across so the
	// refreshed session isn't dropped (Supabase SSR gotcha).
	const {
		data: { user },
	} = await supabase.auth.getUser();

	function redirectWithCookies(url: URL) {
		const redirect = NextResponse.redirect(url);
		response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
		return redirect;
	}

	const devEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === "1";

	// a. /dev with the flag off → return unchanged and let the dev layout produce
	//    the 404. Deliberately no auth check/redirect here: a redirect would leak
	//    the route's existence in production.
	if (pathname.startsWith("/dev") && !devEnabled) {
		return response;
	}

	// b. Protected dev sub-areas with the flag on but no user → send to auth.
	if (
		pathname.startsWith("/dev") &&
		devEnabled &&
		!user &&
		(pathname.startsWith("/dev/dashboard") || pathname.startsWith("/dev/session"))
	) {
		return redirectWithCookies(
			new URL(`/auth?redirect=${encodeURIComponent(pathname)}`, request.url),
		);
	}

	// c. A logged-in user hitting /auth → the redirect param if present, else /.
	if (pathname === "/auth" && user) {
		const target = request.nextUrl.searchParams.get("redirect") ?? "/";
		return redirectWithCookies(new URL(target, request.url));
	}

	// d. Everything else is public.
	return response;
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
