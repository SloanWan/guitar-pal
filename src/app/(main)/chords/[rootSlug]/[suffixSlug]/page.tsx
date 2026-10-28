import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ChordPage from "@/components/chords/page/ChordPage";
import { getChord, getChordIndex, getChordsByRoot } from "@/lib/chordsData";
import { toVoicingCards } from "@/lib/chordCards";
import { chordSpec, chordTones } from "@/lib/chordFormulas";
import { slugToRoot, slugToSuffix } from "@/lib/chordSlug";
import { ROOT_CHROMATIC_ORDER, UNKNOWN_ROOT, chordDisplayName } from "@/lib/chordSuffixes";

/** Roots the app itself writes: the twelve, plus the one for an unnamed chord. */
function isKnownRoot(root: string): boolean {
	return root === UNKNOWN_ROOT || ROOT_CHROMATIC_ORDER.includes(root);
}

type Props = { params: Promise<{ rootSlug: string; suffixSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { rootSlug, suffixSlug } = await params;
	const root = slugToRoot(rootSlug);
	const suffix = slugToSuffix(suffixSlug);
	const chord = await getChord(root, suffix);
	if (!chord) {
		// Not in the library, but maybe the player's own: served, never indexed.
		return {
			title: `${chordDisplayName(root, suffix)} | Guitar Pal`,
			robots: { index: false, follow: false },
		};
	}
	const name = `${root} ${suffix}`;
	const count = chord.chord_voicings.length;
	return {
		title: `${name} Guitar Chord Chart | Guitar Pal`,
		description: `${count} voicing${count !== 1 ? "s" : ""} for the ${name} chord.`,
	};
}

export default async function ChordDetailPage({ params }: Props) {
	const { rootSlug, suffixSlug } = await params;
	const root = slugToRoot(rootSlug);
	const suffix = slugToSuffix(suffixSlug);
	// A root the app never writes is a URL nobody arrived at from inside it; anything
	// else may be a chord of the player's own, which only their browser can confirm.
	if (!isKnownRoot(root)) notFound();

	const [chord, index, rootChords] = await Promise.all([
		getChord(root, suffix),
		getChordIndex(),
		root === UNKNOWN_ROOT ? Promise.resolve([]) : getChordsByRoot(root),
	]);

	return (
		<ChordPage
			key={`${root}|${suffix}`}
			root={root}
			suffix={suffix}
			tones={chordTones(root, suffix)}
			slashBass={chordSpec(suffix)?.slashBass ?? null}
			library={chord ? toVoicingCards(chord.chord_voicings, root, suffix) : []}
			index={index}
			rootChords={rootChords}
		/>
	);
}
