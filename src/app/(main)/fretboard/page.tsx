import type { Metadata } from "next";

import FretboardExplorer from "@/components/fretboard/FretboardExplorer";

export const metadata: Metadata = {
	title: "Scales & Chord Tones on the Fretboard | Guitar Pal",
	description:
		"See any scale across the guitar neck, then lay a chord over it to find which notes are safe to play.",
};

export default function FretboardPage() {
	return <FretboardExplorer />;
}
