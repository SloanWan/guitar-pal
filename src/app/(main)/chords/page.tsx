import Link from "@/components/AppLink";
import type { Metadata } from "next";
import { getChordRoots } from "@/lib/chordsData";
import { rootToSlug } from "@/lib/chordSlug";
import MusicalText from "@/components/MusicalText";

export const metadata: Metadata = {
	title: "Guitar Chord Charts | Guitar Pal",
	description: "Browse guitar chord diagrams by root note or quality.",
};

export default async function ChordsPage() {
	const roots = await getChordRoots();

	return (
		<div className="flex-1 bg-surface">
			<div className="container mx-auto py-8">
				<div className="flex flex-col items-center gap-10">
					<div className="flex flex-col items-center gap-2 text-center">
						<h1 className="text-2xl font-semibold text-ink">Guitar Chords</h1>
						<p className="text-sm text-ink-dim pt-2">
							Select a root note to browse chord shapes.
						</p>
					</div>

					<div className="flex flex-wrap justify-center gap-2">
						{roots.map((root) => (
							<Link
								key={root}
								href={`/chords/${rootToSlug(root)}`}
								className="inline-flex items-center rounded-none border border-line-strong bg-denim-tint px-4 py-2 text-sm font-medium text-denim transition-colors hover:bg-denim hover:text-on-denim"
							>
								<MusicalText text={root} />
							</Link>
						))}
					</div>

					<div className="flex flex-col items-center gap-2">
						<Link
							href="/chords/all"
							className="text-sm text-ink-dim underline hover:text-ink"
						>
							Browse All Chords →
						</Link>
						{/* The shapes the player has written. Empty for most people, and
						    the page says what to do about that, so it is a quiet link
						    rather than a section of its own. */}
						<Link
							href="/chords/my"
							className="text-sm text-ink-dim underline hover:text-ink"
						>
							My Chords →
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}
