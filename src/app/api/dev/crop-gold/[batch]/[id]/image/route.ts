import type { NextRequest } from "next/server";
import { isCropGoldSlug } from "@/lib/cropGold";
import { readPageImage } from "@/lib/cropGoldStore";
import { tabGoldEnabled } from "@/lib/tabGoldStore";

/** The page the boxes are drawn on, at the resolution the reader is given. */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ batch: string; id: string }> };

export async function GET(_request: NextRequest, { params }: Params): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	const { batch, id } = await params;
	const png = isCropGoldSlug(batch) && isCropGoldSlug(id) ? await readPageImage(batch, id) : null;
	if (!png) return new Response(null, { status: 404 });
	return new Response(new Uint8Array(png), {
		headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
	});
}
