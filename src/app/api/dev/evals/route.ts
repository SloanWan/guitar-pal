import { listSuites, readRun } from "@/lib/evals/load";

/**
 * Eval results for `/dev/evals` (#370), read from the checkout's run files.
 *
 * - `GET /api/dev/evals` — every suite and its runs, without cases: what the
 *   page polls while a run is going.
 * - `GET /api/dev/evals?suite=ocr&run=<id>` — one run with its cases.
 *
 * 404 unless the dev routes are on, like the `/dev` pages themselves.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	if (process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES !== "1") return new Response(null, { status: 404 });
	const root = process.cwd();
	const url = new URL(request.url);
	const suite = url.searchParams.get("suite");
	const run = url.searchParams.get("run");
	if (suite && run) {
		const found = await readRun(root, suite, run);
		return found ? Response.json(found) : Response.json({ error: "No such run." }, { status: 404 });
	}
	return Response.json({ suites: await listSuites(root) });
}
