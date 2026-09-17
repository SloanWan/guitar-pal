import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { loadVoicings, peekVoicings } from "@/lib/chordVoicingCache";
import type { ChordRef } from "@/lib/strumPatterns";
import { selectRefVoicing } from "@/lib/strumBars";

/** The shape a chord is held in, or null when the library has none. */
export type VoicingLookup = (ref: ChordRef) => ChordVoicing | null;

/** How long a turn waits on the chord library before answering without it. */
const VOICINGS_TIMEOUT_MS = 8000;

/**
 * Fetches the voicings of every chord named, once, and hands back a lookup
 * that answers without waiting — what `buildTabProposal` takes. The shared
 * cache means a chord already seen on any page costs nothing here. A fetch
 * that fails or hangs does not hold the reply: that chord is written open,
 * and the proposal says so.
 */
export async function loadVoicingLookup(refs: readonly ChordRef[]): Promise<VoicingLookup> {
	const seen = new Map<string, ChordRef>();
	for (const ref of refs) seen.set(`${ref.root}|${ref.suffix}`, ref);
	const fetches = Promise.all(
		[...seen.values()].map((ref) =>
			loadVoicings(ref.root, ref.suffix).catch((e: unknown) => {
				console.error("[tab assistant] voicings:", e);
			}),
		),
	);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<void>((done) => {
		timer = setTimeout(done, VOICINGS_TIMEOUT_MS);
	});
	await Promise.race([fetches, timeout]);
	clearTimeout(timer);
	return (ref) => {
		const voicings = peekVoicings(ref.root, ref.suffix);
		return voicings ? selectRefVoicing(ref, voicings) : null;
	};
}
