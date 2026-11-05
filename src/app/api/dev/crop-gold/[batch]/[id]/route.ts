import type { NextRequest } from "next/server";
import { isCropGoldSlug, readCropReview } from "@/lib/cropGold";
import { readPage, writePageReview } from "@/lib/cropGoldStore";
import { tabGoldEnabled } from "@/lib/tabGoldStore";

/** One page of a batch: its boxes, or the review the page made of them. */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ batch: string; id: string }> };

async function target(params: Params["params"]): Promise<{ batch: string; id: string } | null> {
	const { batch, id } = await params;
	return isCropGoldSlug(batch) && isCropGoldSlug(id) ? { batch, id } : null;
}

export async function GET(_request: NextRequest, { params }: Params): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	const at = await target(params);
	const page = at ? await readPage(at.batch, at.id) : null;
	return page ? Response.json(page) : Response.json({ error: "No such page." }, { status: 404 });
}

export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	const at = await target(params);
	if (!at) return Response.json({ error: "No such page." }, { status: 404 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "The body is not JSON." }, { status: 400 });
	}
	const read = readCropReview(body);
	if ("error" in read) return Response.json({ error: read.error }, { status: 400 });

	const page = await writePageReview(at.batch, at.id, read.review);
	return page ? Response.json(page) : Response.json({ error: "No such page." }, { status: 404 });
}
