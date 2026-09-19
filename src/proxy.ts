import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/safeRedirect";

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
	//
	// A request that cannot reach Supabase at all (a flaky proxy, no network)
	// is treated as signed out rather than thrown: the public pages still
	// render, and the signed-in ones bounce to /auth with a return path, which
	// beats a 500 on every route until the connection comes back.
	let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
	try {
		({
			data: { user },
		} = await supabase.auth.getUser());
	} catch (error) {
		console.warn("[proxy] could not reach Supabase to check the session; treating as signed out:", error);
	}

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

	// c. A logged-in user hitting /auth → the redirect param if it is a local
	//    path, else the personal home.
	if (pathname === "/auth" && user) {
		const target = safeRedirectPath(request.nextUrl.searchParams.get("redirect"));
		return redirectWithCookies(new URL(target, request.url));
	}

	// d. /home, /settings and /books are the signed-in personal surfaces — a
	//    signed-out visitor is sent to auth with a return path so they land back
	//    after signing in.
	if (
		(pathname === "/home" || pathname === "/settings" || pathname.startsWith("/books")) &&
		!user
	) {
		return redirectWithCookies(
			new URL(`/auth?redirect=${encodeURIComponent(pathname)}`, request.url),
		);
	}

	// e. A signed-in user hitting the public hub → their personal home. Signed-out
	//    visitors keep seeing the public hub at / (no redirect, per issue #127).
	if (pathname === "/" && user) {
		return redirectWithCookies(new URL("/home", request.url));
	}

	// f. Everything else is public.
	return response;
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
