import type { NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

/**
 * `/api/books/*` → the Python book service, as the signed-in player.
 *
 * The service verifies the Supabase session JWT itself and filters every
 * query by the user it names, so all this does is read the session from the
 * cookie and forward it as a bearer token. Bodies pass through untouched in
 * both directions; the service's status and JSON are the answer.
 *
 * `BOOK_SERVICE_URL` is `http://book-service:8000` in docker-compose and
 * `http://localhost:8000` for a local `uvicorn`.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

function json(body: unknown, status: number): Response {
	return Response.json(body, { status });
}

async function forward(request: NextRequest, { params }: Params): Promise<Response> {
	const base = process.env.BOOK_SERVICE_URL;
	if (!base) {
		return json({ error: "Book import is not configured on this deployment." }, 503);
	}

	const supabase = await createSupabaseServer();
	const {
		data: { session },
	} = await supabase.auth.getSession();
	if (!session) {
		return json({ error: "Sign in to use book import." }, 401);
	}

	const { path } = await params;
	const segments = path.map(encodeURIComponent).join("/");
	const target = `${base.replace(/\/$/, "")}/books${segments ? `/${segments}` : ""}${request.nextUrl.search}`;
	const headers = new Headers({ Authorization: `Bearer ${session.access_token}` });
	const contentType = request.headers.get("content-type");
	if (contentType) headers.set("Content-Type", contentType);

	let upstream: Response;
	try {
		upstream = await fetch(target, {
			method: request.method,
			headers,
			body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
			cache: "no-store",
		});
	} catch {
		return json({ error: "The book service is not reachable." }, 502);
	}

	return new Response(upstream.body, {
		status: upstream.status,
		headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
	});
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
