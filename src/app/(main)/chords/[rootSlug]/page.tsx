import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getChordsByRoot } from "@/lib/chords";
import { slugToRoot, suffixToSlug } from "@/lib/chordSlug";
import { buildRootSections } from "@/lib/chordBrowseSections";
import MusicalText from "@/components/MusicalText";
import BrowseGrid from "@/components/chords/BrowseGrid";
import ChordToc from "@/components/chords/ChordToc";
import ChordTocIndicator from "@/components/chords/ChordTocIndicator";

type Props = { params: Promise<{ rootSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { rootSlug } = await params;
	const root = slugToRoot(rootSlug);
	return { title: `${root} Chords — Chord Charts | Guitar Pal` };
}

export default async function RootPage({ params }: Props) {
	const { rootSlug } = await params;
	const root = slugToRoot(rootSlug);
	const chords = await getChordsByRoot(root);

	if (chords.length === 0) notFound();

	const sections = buildRootSections(
		chords,
		(_r, suffix) => `/chords/${rootSlug}/${suffixToSlug(suffix)}`,
	);

	return (
		<>
		<ChordToc sections={sections} />
		<ChordTocIndicator sections={sections} />
		<div className="flex-1 bg-surface">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
				<div className="flex flex-col items-center gap-6">
					<div className="flex w-full items-center justify-between">
						<Link
							href="/chords"
							className="text-sm text-ink-dim hover:text-ink"
						>
							← All Roots
						</Link>
						<h1 className="text-2xl font-semibold text-ink">
							<MusicalText text={root} /> Chords
						</h1>
						<Link
							href="/chords/all"
							className="text-sm text-ink-dim hover:text-ink"
						>
							All Chords →
						</Link>
					</div>
					<BrowseGrid sections={sections} />
				</div>
			</div>
		</div>
		</>
	);
}
