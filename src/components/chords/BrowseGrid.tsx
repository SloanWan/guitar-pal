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

export interface BrowseSubsection {
	label: string;
	cards: BrowseCard[];
}

export interface BrowseSection {
	label: string;
	// Flat list used by root-first mode and RootOverviewGrid
	cards: BrowseCard[];
	// Optional root subdivisions used by category-first mode
	subsections?: BrowseSubsection[];
}

interface Props {
	sections: BrowseSection[];
	onSelectChord: (root: string, suffix: string) => void;
}

function CardRow({
	cards,
	onSelectChord,
}: {
	cards: BrowseCard[];
	onSelectChord: (root: string, suffix: string) => void;
}) {
	return (
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
	);
}

export default function BrowseGrid({ sections, onSelectChord }: Props) {
	return (
		<div className="flex w-full flex-col gap-10">
			{sections.map(({ label, cards, subsections }) => (
				<section key={label}>
					{/* Category / root top-level heading */}
					<h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						{label}
					</h3>

					{subsections && subsections.length > 0 ? (
						// Category-first: root subheadings inside each category
						<div className="flex flex-col gap-5">
							{subsections.map(({ label: rootLabel, cards: subCards }) => (
								<div key={rootLabel}>
									<h4 className="mb-2 text-xs font-medium text-muted-foreground/60">
										{rootLabel}
									</h4>
									<CardRow cards={subCards} onSelectChord={onSelectChord} />
								</div>
							))}
						</div>
					) : (
						<CardRow cards={cards} onSelectChord={onSelectChord} />
					)}
				</section>
			))}
		</div>
	);
}
