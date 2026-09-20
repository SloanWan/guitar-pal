import type { Metadata } from "next";

import FretboardExplorer from "@/components/fretboard/FretboardExplorer";

export const metadata: Metadata = {
	title: "Scales & Chord Tones on the Fretboard | Guitar Pal",
	description:
		"See any scale across the guitar neck, then lay a chord over it to find which notes are safe to play.",
};

export default function FretboardPage() {
	return (
		<div className="flex-1 bg-surface">
			<div className="container mx-auto px-(--gutter) py-8">
				<h1 className="mb-6 text-2xl font-semibold text-ink">Fretboard Playground</h1>
				<FretboardExplorer />
			</div>
		</div>
	);
}
