"use client";

import { useEffect, useState } from "react";
import { getChordsByRoot } from "@/lib/chords";
import { buildRootSections } from "@/lib/chordBrowseSections";
import BrowseGrid from "@/components/chords/BrowseGrid";

interface Props {
	root: string;
	onSelectChord: (root: string, suffix: string) => void;
}

interface Loaded {
	root: string;
	chords: Awaited<ReturnType<typeof getChordsByRoot>>;
}

export default function RootOverviewGrid({ root, onSelectChord }: Props) {
	const [loaded, setLoaded] = useState<Loaded | null>(null);

	useEffect(() => {
		let cancelled = false;
		getChordsByRoot(root).then((chords) => {
			if (!cancelled) setLoaded({ root, chords });
		});
		return () => {
			cancelled = true;
		};
	}, [root]);

	// Show loading when nothing is loaded yet OR when data is for a different root
	if (!loaded || loaded.root !== root) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}

	return (
		<BrowseGrid
			sections={buildRootSections(loaded.chords)}
			onSelectChord={onSelectChord}
		/>
	);
}
