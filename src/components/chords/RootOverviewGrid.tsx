"use client";

import { useEffect, useState } from "react";
import { getChordsByRoot, type ChordWithVoicings } from "@/lib/chords";
import { groupSuffixes, getSlashSuffixes } from "@/lib/chordSuffixes";
import {
	selectStandardVoicing,
	chordVoicingToVexChords,
} from "@/lib/chordVoicingToVexChords";
import BrowseGrid, { type BrowseSection, type BrowseCard } from "@/components/chords/BrowseGrid";

interface Props {
	root: string;
	onSelectChord: (root: string, suffix: string) => void;
}

function buildSections(root: string, data: ChordWithVoicings[]): BrowseSection[] {
	const byRoot = new Map(data.map((c) => [c.suffix, c]));
	const suffixes = data.map((c) => c.suffix);
	const categoryGroups = groupSuffixes(suffixes);
	const slashSuffs = getSlashSuffixes(suffixes);

	function makeCards(suffs: readonly string[]): BrowseCard[] {
		return suffs.flatMap((s) => {
			const chord = byRoot.get(s);
			if (!chord) return [];
			const voicing = selectStandardVoicing(chord.chord_voicings);
			if (!voicing) return [];
			return [
				{
					key: `${root}-${s}`,
					root,
					suffix: s,
					def: chordVoicingToVexChords(voicing),
					label: s,
				},
			];
		});
	}

	const sections: BrowseSection[] = categoryGroups
		.map(({ category, suffixes: gs }) => ({ label: category, cards: makeCards(gs) }))
		.filter((s) => s.cards.length > 0);

	const slashCards = makeCards(slashSuffs);
	if (slashCards.length > 0) sections.push({ label: "Slash Chords", cards: slashCards });

	return sections;
}

interface Loaded {
	root: string;
	chords: ChordWithVoicings[];
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

	const data = loaded.chords;

	return <BrowseGrid sections={buildSections(root, data)} onSelectChord={onSelectChord} />;
}
