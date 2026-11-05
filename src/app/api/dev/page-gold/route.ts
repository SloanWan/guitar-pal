import { listPageSets, pageGoldRoot } from "@/lib/pageGoldStore";
import { tabGoldEnabled } from "@/lib/tabGoldStore";

/** `/dev/page-gold`'s index: every book and its pages' review status. */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	return Response.json({ root: pageGoldRoot(), sets: await listPageSets() });
}
