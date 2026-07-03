"use client";

import LazyChordDiagram from "@/components/chords/LazyChordDiagram";
import type { VexChordDef } from "@/lib/chordVoicingToVexChords";

export interface BrowseCard {
	key: string;
	root: string;
	suffix: string;
	def: VexChordDef;
	label: string;
}

export interface BrowseSection {
	label: string;
	cards: BrowseCard[];
}

interface Props {
	sections: BrowseSection[];
	onSelectChord: (root: string, suffix: string) => void;
}

export default function BrowseGrid({ sections, onSelectChord }: Props) {
	return (
		<div className="flex w-full flex-col gap-10">
			{sections.map(({ label, cards }) => (
				<section key={label}>
					<h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						{label}
					</h3>
					<div className="flex flex-wrap gap-3">
						{cards.map((card) => (
							<LazyChordDiagram
								key={card.key}
								def={card.def}
								label={card.label}
								compact
								onClick={() => onSelectChord(card.root, card.suffix)}
							/>
						))}
					</div>
				</section>
			))}
		</div>
	);
}
