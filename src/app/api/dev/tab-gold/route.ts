import { listSets, tabGoldEnabled, tabGoldRoot } from "@/lib/tabGoldStore";

/** `/dev/tab-gold`'s index: every gold set and its exercises' review status. */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	return Response.json({ root: tabGoldRoot(), sets: await listSets() });
}
