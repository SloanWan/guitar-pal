"use client";

import { useCallback, useMemo, useState } from "react";

import LazyChordDiagram from "@/components/chords/LazyChordDiagram";
import ChordVoicingModal from "@/components/chords/ChordVoicingModal";
import ChordRequestButton from "@/components/chords/ChordRequestButton";
import { useChordPreview } from "@/components/chords/useChordPreview";
import { MAX_BATCH_TOKENS } from "@/lib/chordBatchResolve";
import type { BatchGridCard, BatchGridHit } from "@/lib/chordCards";

interface Props {
	cards: readonly BatchGridCard[];
	truncated: boolean;
}

// Card footprint of LazyChordDiagram at size="regular" — the "not found" tile matches it
// so a miss doesn't punch a hole in the row.
const MISS_CARD = { width: 210, height: 240 };

// Side-by-side diagrams for a multi-chord query. All resolution and voicing loading
// happens on the server (the ?q= URL is the source of truth), and the chord search
// palette is the only way in — so this component just renders and drives the modal.
export default function ChordBatchGrid({ cards, truncated }: Props) {
	const preview = useChordPreview();
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	// Kept separate from selectedKey so the card stays rendered through the close
	// transition instead of vanishing the instant the modal is dismissed.
	const [modalOpen, setModalOpen] = useState(false);
	// Voicing the user last paged to in the modal, per card. Absent means "the Standard
	// shape the card was built with".
	const [chosenIndex, setChosenIndex] = useState<Record<string, number>>({});

	const selected = useMemo(
		() => cards.find((c): c is BatchGridHit => c.key === selectedKey && c.status === "resolved"),
		[cards, selectedKey],
	);

	// Keeps the modal's voicing list referentially stable across re-renders so its
	// open-time reset doesn't re-fire while the user is paging.
	const modalVoicings = useMemo(() => selected?.voicings ?? [], [selected]);

	const rememberVoicing = useCallback(
		(index: number) => {
			if (!selectedKey) return;
			setChosenIndex((prev) => ({ ...prev, [selectedKey]: index }));
		},
		[selectedKey],
	);

	return (
		<div className="flex w-full flex-col items-center gap-6">
			{truncated && (
				<p className="text-xs text-ink-dim">
					Showing the first {MAX_BATCH_TOKENS} chords.
				</p>
			)}

			{cards.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-ink-dim">
					<p>Nothing to show yet.</p>
					<p className="text-xs">
						Search several chords at once — <span className="text-ink">C Am F G</span> —
						and they land here side by side. Commas force it:{" "}
						<span className="text-ink">C, Am</span>
					</p>
				</div>
			) : (
				<div className="flex flex-wrap justify-center gap-4">
					{cards.map((card) => {
						if (card.status !== "resolved") {
							return (
								<div
									key={card.key}
									style={MISS_CARD}
									className="flex shrink-0 flex-col items-center justify-center gap-3 rounded-none border border-dashed border-line-strong bg-surface px-4 text-center"
								>
									<span className="text-sm font-medium text-ink">{card.token}</span>
									<span className="text-xs text-ink-dim">No chord found</span>
									<ChordRequestButton
										query={card.token}
										label="Report as missing"
										className="rounded-md border border-line-strong px-2.5 py-1 text-xs font-medium text-denim transition-colors hover:bg-denim-tint"
									/>
								</div>
							);
						}

						// Whatever the user last paged to in the modal, else the Standard shape
						// the card was built with. The voicing name is appended only once it
						// diverges, so an untouched grid stays labelled with plain chord names.
						const index = chosenIndex[card.key] ?? card.standardIndex;
						const voicing = card.voicings[index];
						return (
							<LazyChordDiagram
								key={card.key}
								def={voicing.def}
								label={
									index === card.standardIndex
										? card.label
										: `${card.label} · ${voicing.label}`
								}
								size="regular"
								onClick={() => {
									setSelectedKey(card.key);
									setModalOpen(true);
								}}
							/>
						);
					})}
				</div>
			)}

			{cards.some((c) => c.status === "resolved") && (
				<p className="text-xs text-ink-dim">
					Click a chord to browse all of its voicings.
				</p>
			)}

			<ChordVoicingModal
				voicings={modalVoicings}
				root={selected?.root}
				suffix={selected?.suffix}
				open={modalOpen && selected !== undefined}
				initialIndex={selected ? (chosenIndex[selected.key] ?? selected.standardIndex) : 0}
				onClose={() => setModalOpen(false)}
				onActiveIndexChange={rememberVoicing}
				preview={preview}
			/>
		</div>
	);
}
