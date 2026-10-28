"use client";

import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight, MoveLeft, MoveRight, X } from "lucide-react";
import Link from "@/components/AppLink";
import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";
import ChordRequestButton from "@/components/chords/ChordRequestButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { moveOnBoard, pageOnBoard, removeFromBoard, type BoardItem } from "@/lib/chordBoard";
import { withGlyphs } from "@/lib/chordFormulas";
import { chordHref } from "@/lib/chordSlug";
import { chordSymbol } from "@/lib/chordSuffixes";
import { rootPitchClass } from "@/lib/chordVoicingToMidi";
import type { BoardCard } from "./useBoard";

interface Props {
	items: readonly BoardItem[];
	cards: readonly BoardCard[];
	onChange: (items: BoardItem[]) => void;
}

/** The chords side by side, each on the shape the player paged to. */
export default function Board({ items, cards, onChange }: Props) {
	const found = cards.filter((c) => c.status === "found").length;
	return (
		<section className="hb-board" aria-label="Board">
			<div className="hb-board-head">
				<h2>Board</h2>
				{cards.length > 0 && (
					<span className="hb-meta">
						{found} chord{found === 1 ? "" : "s"} · each keeps the shape you page to
					</span>
				)}
			</div>
			<div className="hb-cards">
				{cards.length === 0 && (
					<p className="hb-meta hb-board-empty">
						The board is empty. Type a few chords above — <b>C Am F G</b> — and put them here side by side.
					</p>
				)}
				{cards.map((card, i) => {
					const remove = (
						<Button
							variant="ghost"
							size="xs"
							className="hb-remove"
							aria-label={`Take ${card.item.token} off the board`}
							onClick={() => onChange(removeFromBoard(items, i))}
						>
							<X aria-hidden />
						</Button>
					);
					if (card.status === "missing") {
						return (
							<div key={i} className="hb-card" data-miss="" style={{ "--i": i } as CSSProperties}>
								{remove}
								<span className="hb-card-name">{card.item.token}</span>
								<span className="hb-meta">No chord found</span>
								<ChordRequestButton key={card.item.token} query={card.item.token} label="Report as missing" />
							</div>
						);
					}
					const name = withGlyphs(chordSymbol(card.root, card.suffix));
					const count = card.shapes?.length ?? 0;
					const at = count > 0 ? Math.min(card.item.shape, count - 1) : 0;
					const shape = card.shapes?.[at];
					return (
						<div key={i} className="hb-card" style={{ "--i": i } as CSSProperties}>
							{remove}
							<Link className="hb-card-name gp-focus" href={chordHref(card.root, card.suffix)}>
								<span className="gp-title">{name}</span>
							</Link>
							<span className="hb-meta hb-card-label">{shape?.label ?? " "}</span>
							<span className="hb-card-dg" aria-hidden>
								{shape ? (
									<ChordDiagramSVG {...shape.def} rootMidi={rootPitchClass(card.root)} size="compact" />
								) : (
									<Skeleton className="h-24 w-24" />
								)}
							</span>
							<div className="hb-card-tools">
								<Button variant="ghost" size="xs" aria-label={`Move ${name} left`} disabled={i === 0} onClick={() => onChange(moveOnBoard(items, i, -1))}>
									<MoveLeft aria-hidden />
								</Button>
								<Button variant="ghost" size="xs" aria-label={`Previous shape of ${name}`} disabled={count < 2} onClick={() => onChange(pageOnBoard(items, i, -1, count))}>
									<ChevronLeft aria-hidden />
								</Button>
								<span className="hb-meta hb-count">{count > 0 ? `${at + 1}/${count}` : "–"}</span>
								<Button variant="ghost" size="xs" aria-label={`Next shape of ${name}`} disabled={count < 2} onClick={() => onChange(pageOnBoard(items, i, 1, count))}>
									<ChevronRight aria-hidden />
								</Button>
								<Button
									variant="ghost"
									size="xs"
									aria-label={`Move ${name} right`}
									disabled={i === cards.length - 1}
									onClick={() => onChange(moveOnBoard(items, i, 1))}
								>
									<MoveRight aria-hidden />
								</Button>
							</div>
						</div>
					);
				})}
			</div>
			<div className="hb-board-foot">
				{cards.length > 0 && (
					<Button variant="ghost" size="xs" onClick={() => onChange([])}>
						Clear
					</Button>
				)}
				<p className="hb-hint">Add chords with the search above, or the + on any chord in the library</p>
			</div>
		</section>
	);
}
