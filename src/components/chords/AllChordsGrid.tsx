"use client";

import { useEffect, useState } from "react";
import { getAllChordsWithVoicings, type ChordWithVoicings } from "@/lib/chords";
import {
	buildAllChordsRootFirst,
	buildAllChordsCategories,
} from "@/lib/chordBrowseSections";
import BrowseGrid from "@/components/chords/BrowseGrid";
import { Button } from "@/components/ui/button";

type Grouping = "root-first" | "category-first";

interface Props {
	onSelectChord: (root: string, suffix: string) => void;
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
		grouping === "root-first"
			? buildAllChordsRootFirst(allChords)
			: buildAllChordsCategories(allChords);

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
