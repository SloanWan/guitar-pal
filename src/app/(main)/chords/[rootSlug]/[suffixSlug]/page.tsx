import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getChord } from "@/lib/chords";
import { slugToRoot, slugToSuffix } from "@/lib/chordSlug";
import { chordVoicingToVexChords } from "@/lib/chordVoicingToVexChords";
import ChordDetailView, { type VoicingCard } from "@/components/chords/ChordDetailView";
import MusicalText from "@/components/MusicalText";

type Props = { params: Promise<{ rootSlug: string; suffixSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { rootSlug, suffixSlug } = await params;
	const root = slugToRoot(rootSlug);
	const suffix = slugToSuffix(suffixSlug);
	const chord = await getChord(root, suffix);
	if (!chord) return { title: "Chord Not Found | Guitar Pal" };
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

	if (!chord) notFound();

	const voicings: VoicingCard[] = chord.chord_voicings.map((v) => ({
		id: v.id,
		label: v.label ?? `Pos. ${v.start_fret}`,
		def: chordVoicingToVexChords(v),
	}));

	return (
		<div className="h-full bg-background flex flex-col">
			<div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col flex-1">
				<div className="flex flex-col items-center gap-6 flex-1">
					<div className="flex w-full items-center justify-between">
						<Link
							href={`/chords/${rootSlug}`}
							className="text-sm text-muted-foreground hover:text-foreground"
						>
							← <MusicalText text={root} /> Chords
						</Link>
						<h1 className="text-2xl font-semibold">
							<MusicalText text={root} /> <MusicalText text={suffix} />
						</h1>
						<Link
							href="/chords/all"
							className="text-sm text-muted-foreground hover:text-foreground"
						>
							All Chords →
						</Link>
					</div>
					<div className="flex-1 flex items-center justify-center w-full pb-[10%]">
						<ChordDetailView voicings={voicings} />
					</div>
				</div>
			</div>
		</div>
	);
}
