"use client";

import LazyChordDiagram from "@/components/chords/LazyChordDiagram";
import type { BrowseCard, BrowseSubsection, BrowseSection } from "@/lib/chordBrowseSections";
import { tocSectionId, tocSubsectionId } from "@/lib/chordToc";
import MusicalText from "@/components/MusicalText";

// Re-export types so existing importers don't need to change their import path.
export type { BrowseCard, BrowseSubsection, BrowseSection };

interface Props {
	sections: BrowseSection[];
	// Optional: when absent, cards use href-based Link navigation instead.
	onSelectChord?: (root: string, suffix: string) => void;
}

function CardRow({
	cards,
	onSelectChord,
}: {
	cards: BrowseCard[];
	onSelectChord?: (root: string, suffix: string) => void;
}) {
	return (
		<div className="flex flex-wrap gap-3">
			{cards.map((card) => (
				<LazyChordDiagram
					key={card.key}
					def={card.def}
					label={card.label}
					size="compact"
					href={card.href}
					onClick={card.href ? undefined : () => onSelectChord?.(card.root, card.suffix)}
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
					<h3 id={tocSectionId(label)} className="mb-3 text-s font-semibold uppercase tracking-widest text-denim">
						<MusicalText
							text={label}
							className="space-x-[0.01em]"
							symbolClassName="font-[system-ui] text-[1.2em] translate-y-[0.15em] inline-block"
						/>
					</h3>

					{subsections && subsections.length > 0 ? (
						// Category-first: root subheadings inside each category
						<div className="flex flex-col gap-5">
							{subsections.map(({ label: rootLabel, cards: subCards }) => (
								<div key={rootLabel}>
									<h4 id={tocSubsectionId(label, rootLabel)} className="mb-2 text-xs font-medium text-denim">
										<MusicalText
											text={rootLabel}
											className="space-x-[0.01em]"
											symbolClassName="font-[system-ui] text-[1.2em] translate-y-[0.15em] inline-block -ml-[0.05em]"
										/>
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
