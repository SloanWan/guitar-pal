"use client";

import { useEffect, useState } from "react";
import { getAllChordsWithVoicings, type ChordWithVoicings } from "@/lib/chords";
import {
	CHORD_SUFFIX_CATEGORIES,
	groupSuffixes,
	getSlashSuffixes,
	isSlashChord,
	EXCLUDED_SUFFIXES,
} from "@/lib/chordSuffixes";
import {
	selectStandardVoicing,
	chordVoicingToVexChords,
} from "@/lib/chordVoicingToVexChords";
import BrowseGrid, {
	type BrowseSection,
	type BrowseSubsection,
	type BrowseCard,
} from "@/components/chords/BrowseGrid";
import { Button } from "@/components/ui/button";

type Grouping = "root-first" | "category-first";

interface Props {
	onSelectChord: (root: string, suffix: string) => void;
}

function toCard(
	chord: ChordWithVoicings,
	labelMode: "suffix" | "root-suffix",
): BrowseCard | null {
	const voicing = selectStandardVoicing(chord.chord_voicings);
	if (!voicing) return null;
	return {
		key: `${chord.root}-${chord.suffix}`,
		root: chord.root,
		suffix: chord.suffix,
		def: chordVoicingToVexChords(voicing),
		label: labelMode === "suffix" ? chord.suffix : `${chord.root} ${chord.suffix}`,
	};
}

function buildRootFirst(allChords: ChordWithVoicings[]): BrowseSection[] {
	const rootOrder = [...new Set(allChords.map((c) => c.root))];
	return rootOrder.flatMap((root) => {
		const forRoot = allChords.filter((c) => c.root === root);
		const suffixes = forRoot.map((c) => c.suffix);
		const groups = groupSuffixes(suffixes);
		const slashSuffs = getSlashSuffixes(suffixes);
		const orderedSuffixes = [
			...groups.flatMap((g) => g.suffixes),
			...slashSuffs,
		];
		const cards = orderedSuffixes.flatMap((s) => {
			const chord = forRoot.find((c) => c.suffix === s);
			if (!chord) return [];
			const card = toCard(chord, "suffix");
			return card ? [card] : [];
		});
		return cards.length > 0 ? [{ label: root, cards }] : [];
	});
}

function buildCategoryFirst(allChords: ChordWithVoicings[]): BrowseSection[] {
	// Preserve the DB root order (alphabetical from .order("root"))
	const rootOrder = [...new Set(allChords.map((c) => c.root))];

	function rootSubsections(
		filterFn: (c: ChordWithVoicings) => boolean,
	): BrowseSubsection[] {
		return rootOrder.flatMap((root) => {
			const cards = allChords
				.filter((c) => c.root === root && filterFn(c))
				.flatMap((c) => {
					const card = toCard(c, "suffix");
					return card ? [card] : [];
				});
			return cards.length > 0 ? [{ label: root, cards }] : [];
		});
	}

	const sections: BrowseSection[] = CHORD_SUFFIX_CATEGORIES.flatMap(
		({ category, suffixes }) => {
			const subs = rootSubsections((c) => suffixes.includes(c.suffix));
			return subs.length > 0 ? [{ label: category, cards: [], subsections: subs }] : [];
		},
	);

	const slashSubs = rootSubsections(
		(c) => isSlashChord(c.suffix) && !EXCLUDED_SUFFIXES.includes(c.suffix),
	);
	if (slashSubs.length > 0) {
		sections.push({ label: "Slash Chords", cards: [], subsections: slashSubs });
	}

	return sections;
}

export default function AllChordsGrid({ onSelectChord }: Props) {
	const [allChords, setAllChords] = useState<ChordWithVoicings[] | null>(null);
	const [grouping, setGrouping] = useState<Grouping>("root-first");

	useEffect(() => {
		getAllChordsWithVoicings().then(setAllChords);
	}, []);

	if (!allChords) {
		return <p className="text-sm text-muted-foreground">Loading all chords…</p>;
	}

	const sections =
		grouping === "root-first" ? buildRootFirst(allChords) : buildCategoryFirst(allChords);

	return (
		<div className="flex w-full flex-col gap-6">
			<div className="flex justify-center gap-2">
				<Button
					size="sm"
					variant={grouping === "root-first" ? "default" : "outline"}
					onClick={() => setGrouping("root-first")}
				>
					By Root
				</Button>
				<Button
					size="sm"
					variant={grouping === "category-first" ? "default" : "outline"}
					onClick={() => setGrouping("category-first")}
				>
					By Category
				</Button>
			</div>
			<BrowseGrid sections={sections} onSelectChord={onSelectChord} />
		</div>
	);
}
