import { notFound } from "next/navigation";
import Link from "@/components/AppLink";
import type { Metadata } from "next";
import { getChord } from "@/lib/chordsData";
import { slugToRoot, slugToSuffix } from "@/lib/chordSlug";
import { toVoicingCards } from "@/lib/chordCards";
import ChordDetailView from "@/components/chords/ChordDetailView";
import MusicalText from "@/components/MusicalText";
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
		// The library does not carry it, but the player may: the page is theirs to
		// see and nobody else's to find, so it is served rather than 404'd, and
		// kept out of the index.
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
	const chord = await getChord(root, suffix);

	// A root the app never writes is a URL nobody could have arrived at from
	// inside it; anything else may be a chord of the player's own, which only
	// their browser can confirm.
	if (!chord && !isKnownRoot(root)) notFound();

	const voicings = chord ? toVoicingCards(chord.chord_voicings) : [];

	return (
		<div className="flex-1 bg-surface flex flex-col">
			<div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col flex-1">
				<div className="flex flex-col items-center gap-6 flex-1">
					<div className="flex w-full items-center justify-between">
						{root === UNKNOWN_ROOT ? (
							<Link href="/chords" className="text-sm text-ink-dim hover:text-ink">
								← Chords
							</Link>
						) : (
							<Link
								href={`/chords/${rootSlug}`}
								className="text-sm text-ink-dim hover:text-ink"
							>
								← <MusicalText text={root} /> Chords
							</Link>
						)}
						<h1 className="text-2xl font-semibold text-ink">
							<MusicalText text={chordDisplayName(root, suffix)} />
						</h1>
						<Link
							href="/chords/all"
							className="text-sm text-ink-dim hover:text-ink"
						>
							All Chords →
						</Link>
					</div>
					<div className="flex-1 flex items-center justify-center w-full pb-[10%]">
						<ChordDetailView voicings={voicings} root={root} suffix={suffix} />
					</div>
				</div>
			</div>
		</div>
	);
}
