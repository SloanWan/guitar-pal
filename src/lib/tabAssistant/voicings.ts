import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { loadVoicings, peekVoicings } from "@/lib/chordVoicingCache";
import type { ChordRef } from "@/lib/strumPatterns";
import { selectRefVoicing } from "@/lib/strumBars";

/** The shape a chord is held in, or null when the library has none. */
export type VoicingLookup = (ref: ChordRef) => ChordVoicing | null;

/**
 * Fetches the voicings of every chord named, once, and hands back a lookup
 * that answers without waiting — what `buildTabProposal` takes. The shared
 * cache means a chord already seen on any page costs nothing here.
 */
export async function loadVoicingLookup(refs: readonly ChordRef[]): Promise<VoicingLookup> {
	const seen = new Map<string, ChordRef>();
	for (const ref of refs) seen.set(`${ref.root}|${ref.suffix}`, ref);
	await Promise.all(
		[...seen.values()].map((ref) =>
			loadVoicings(ref.root, ref.suffix).catch((e: unknown) => {
				// A chord the fetch failed on is written open, and the proposal says so.
				console.error("[tab assistant] voicings:", e);
			}),
		),
	);
	return (ref) => {
		const voicings = peekVoicings(ref.root, ref.suffix);
		return voicings ? selectRefVoicing(ref, voicings) : null;
	};
}
