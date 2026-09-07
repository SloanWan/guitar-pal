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
				<div className="mb-6 flex flex-col gap-2">
					<div className="font-mono text-[11px] uppercase tracking-[0.18em] text-denim-accent">
						{"// FRETBOARD"}
					</div>
					<h1 className="text-2xl font-semibold text-ink">Scales &amp; chord tones</h1>
					<p className="max-w-[60ch] text-sm text-ink-dim">
						Pick a root and a scale to see it across the neck. Add a chord to light up its tones
						over the scale: solid dots are safe over that chord, hollow ones are the rest of the
						scale. Switch to degrees to carry the shape into any key.
					</p>
				</div>
				<FretboardExplorer />
			</div>
		</div>
	);
}
