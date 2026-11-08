import { getAllChordsWithVoicings } from "@/lib/chordsData";
import { parseVoicingsQuery, voicingsFromLibrary } from "@/lib/chordVoicingsApi";

/**
 * The shared chord shapes, for the browser's voicing cache (#463).
 *
 * `?c=root:suffix`, repeated: answered from the server's cached copy of the
 * whole library (`getAllChordsWithVoicings`, revalidated hourly), so the
 * server reads Supabase about once an hour whatever is asked, and a made-up
 * chord costs nothing but an empty list. The player's own shapes are not here:
 * they are per account and stay behind RLS.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	const chords = parseVoicingsQuery(new URL(request.url).searchParams);
	if (!chords) return new Response(null, { status: 400 });
	let library;
	try {
		library = await getAllChordsWithVoicings();
	} catch (error) {
		console.error("[chords/voicings]", error);
		return new Response(null, { status: 503 });
	}
	return Response.json(voicingsFromLibrary(library, chords), {
		// The library changes only with a migration; a browser may keep an answer for the hour the server does.
		headers: { "Cache-Control": "public, max-age=3600" },
	});
}
