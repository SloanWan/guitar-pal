import type { NextRequest } from "next/server";
import { readPageReview } from "@/lib/pageGold";
import { readPageRecord, writePageReview } from "@/lib/pageGoldStore";
import { isTabGoldSlug } from "@/lib/tabGold";
import { tabGoldEnabled } from "@/lib/tabGoldStore";

/** One page's record: read it, or write the review the page made of it. */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ set: string; id: string }> };

async function target(params: Params["params"]): Promise<{ set: string; id: string } | null> {
	const { set, id } = await params;
	return isTabGoldSlug(set) && isTabGoldSlug(id) ? { set, id } : null;
}

export async function GET(_request: NextRequest, { params }: Params): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	const at = await target(params);
	const record = at ? await readPageRecord(at.set, at.id) : null;
	return record ? Response.json(record) : Response.json({ error: "No such page." }, { status: 404 });
}

export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	const at = await target(params);
	const record = at ? await readPageRecord(at.set, at.id) : null;
	if (!at || !record) return Response.json({ error: "No such page." }, { status: 404 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "The body is not JSON." }, { status: 400 });
	}
	const read = readPageReview(body, record.model.kind);
	if ("error" in read) return Response.json({ error: read.error }, { status: 400 });

	const saved = await writePageReview(at.set, at.id, read.review);
	return saved ? Response.json(saved) : Response.json({ error: "No such page." }, { status: 404 });
}
