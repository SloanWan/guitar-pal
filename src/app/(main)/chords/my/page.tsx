// Static segment `/chords/my` takes priority over the `/chords/[rootSlug]`
// dynamic route — root slugs are chromatic note names, so none collides with
// "my".

import type { Metadata } from "next";
import Link from "@/components/AppLink";
import MyChordsView from "@/components/chords/MyChordsView";

export const metadata: Metadata = {
	title: "My Chords | Guitar Pal",
	description: "Every chord shape you have written down.",
	// One player's chords, held in their own browser or account: nothing to index.
	robots: { index: false, follow: false },
};

export default function MyChordsPage() {
	return (
		<div className="flex flex-1 flex-col bg-surface">
			<div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
				<div className="flex w-full items-center justify-between">
					<Link href="/chords" className="text-sm text-ink-dim hover:text-ink">
						← Chords
					</Link>
					<h1 className="text-2xl font-semibold text-ink">My chords</h1>
					<Link href="/chords/all" className="text-sm text-ink-dim hover:text-ink">
						All Chords →
					</Link>
				</div>
				<MyChordsView />
			</div>
		</div>
	);
}
