import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "./lib/supabase-server";

export async function middleware(request: NextRequest) {
	const response = NextResponse.next();

	const supabase = await createSupabaseServer();

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user && !request.nextUrl.pathname.startsWith("/auth")) {
		return NextResponse.redirect(new URL("/auth", request.url));
	}

	return response;
}

export const config = {
	matcher: [
		"/dashboard",
		"/session/:path*",
		"/routines/:path*",
		"/practice-logs",
		"/exercise-logs",
	],
};
