"use client";

import { useState } from "react";
import ChordSearchSelect from "@/components/strum/ChordSearchSelect";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { ChordRef } from "@/lib/strumPatterns";

export default function ChordSelectHarness({
	index,
}: {
	index: readonly ChordIndexEntry[];
}) {
	const [chords, setChords] = useState<(ChordRef | null)[]>([
		{ root: "C", suffix: "major", voicingId: null },
		null,
		null,
	]);

	return (
		<main className="mx-auto flex max-w-lg flex-col gap-6 p-8">
			<h1 className="font-mono text-sm font-semibold text-ink">
				chord select harness — {index.length} chords indexed
			</h1>

			{chords.map((chord, i) => (
				<div key={i} className="flex items-center gap-3 border-l border-line-strong pl-2">
					<span className="font-mono text-[9px] tracking-[0.2em] text-ink-faint">
						{i + 1}
					</span>
					<ChordSearchSelect
						chord={chord}
						onChange={(next) =>
							setChords((prev) => prev.map((c, j) => (j === i ? next : c)))
						}
						index={index}
						ariaLabel={`Chord for bar ${i + 1}`}
					/>
					<span className="font-mono text-[10px] text-ink-dim">
						{chord ? JSON.stringify(chord) : "null"}
					</span>
				</div>
			))}
		</main>
	);
}
