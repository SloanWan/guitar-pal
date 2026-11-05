import type { NextRequest } from "next/server";
import { readPageImage } from "@/lib/pageGoldStore";
import { isTabGoldCrop, isTabGoldSlug } from "@/lib/tabGold";
import { tabGoldEnabled } from "@/lib/tabGoldStore";

/** A page's image, from the set's `pages/`. */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ set: string; file: string }> };

export async function GET(_request: NextRequest, { params }: Params): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	const { set, file } = await params;
	const png = isTabGoldSlug(set) && isTabGoldCrop(file) ? await readPageImage(set, file) : null;
	if (!png) return new Response(null, { status: 404 });
	return new Response(new Uint8Array(png), {
		headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
	});
}
