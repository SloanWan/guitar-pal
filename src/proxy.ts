import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
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

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user && !request.nextUrl.pathname.startsWith("/auth") && request.nextUrl.pathname != "/") {
		return NextResponse.redirect(new URL("/auth", request.url));
	}
	if (user) {
		if (request.nextUrl.pathname.startsWith("/auth")) {
			return NextResponse.redirect(new URL("/dashboard", request.url));
		}
		if (request.nextUrl.pathname === "/") {
			return NextResponse.redirect(new URL("/dashboard", request.url));
		}
	}

	return response;
}

export const config = {
	matcher: ["/dashboard/:path*", "/session/:path*", "/", "/auth/:path*"],
};
