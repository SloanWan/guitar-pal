import { cropGoldRoot, listBatches } from "@/lib/cropGoldStore";
import { tabGoldEnabled } from "@/lib/tabGoldStore";

/** `/dev/crop-gold`'s index: every batch and its pages' review status. */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	if (!tabGoldEnabled()) return new Response(null, { status: 404 });
	return Response.json({ root: cropGoldRoot(), batches: await listBatches() });
}
