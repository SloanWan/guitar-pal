import type { NextRequest } from "next/server";
import { isTabGoldSlug, readReview } from "@/lib/tabGold";
import { readRecord, tabGoldEnabled, writeReview } from "@/lib/tabGoldStore";

/** One gold record: read it, or write the review the page made of it. */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ set: string; id: string }> };

async function target(params: Params["params"]): Promise<{ set: string; id: string } | null> {
	const { set, id } = await params;
	return isTabGoldSlug(set) && isTabGoldSlug(id) ? { set, id } : null;
}

export async function GET(_request: NextRequest, { params }: Params): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	const at = await target(params);
	const record = at ? await readRecord(at.set, at.id) : null;
	return record ? Response.json(record) : Response.json({ error: "No such exercise." }, { status: 404 });
}

export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	const at = await target(params);
	if (!at) return Response.json({ error: "No such exercise." }, { status: 404 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "The body is not JSON." }, { status: 400 });
	}
	const read = readReview(body);
	if ("error" in read) return Response.json({ error: read.error }, { status: 400 });

	const record = await writeReview(at.set, at.id, read.review);
	return record ? Response.json(record) : Response.json({ error: "No such exercise." }, { status: 404 });
}
