"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import Link from "@/components/AppLink";
import ChordRequestButton from "@/components/chords/ChordRequestButton";
import { useChordSearchNavigation } from "@/components/chords/useChordSearchNavigation";
import { useChordShapeMatches } from "@/components/chords/useChordShapeMatches";
import { Button } from "@/components/ui/button";
import type { ChordLookup } from "@/lib/chordBatchResolve";
import type { BoardItem } from "@/lib/chordBoard";
import { chordQualityLine } from "@/lib/chordPage";
import { readQuery } from "@/lib/chordReading";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { shapeMatchNote } from "@/lib/chordShapeSearch";
import { chordHref } from "@/lib/chordSlug";
import { chordSymbol } from "@/lib/chordSuffixes";
import { withGlyphs } from "@/lib/chordFormulas";

const EXAMPLES = ["Am7", "C Am F G", "01023x"];

interface Props {
	index: readonly ChordIndexEntry[];
	lookup: ChordLookup;
	onAdd: (items: BoardItem[]) => void;
}

/** One chord to act on: what Enter and the two buttons do. */
interface Target {
	root: string;
	suffix: string;
	shape: number;
}

/**
 * The hub's search: a chord, several chords, or a shape. The line under it says
 * how the query was read; Open goes to the chord, Add to board puts it on the board.
 */
export default function AskBar({ index, lookup, onAdd }: Props) {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const reading = useMemo(() => readQuery(query, index, lookup), [query, index, lookup]);
	const shape = useChordShapeMatches(query);
	const { goToChord, goToBrowse } = useChordSearchNavigation(() => setQuery(""));
	const trimmed = query.trim();

	let target: Target | null = null;
	if (reading.kind === "names" && reading.results[0]) target = { ...reading.results[0], shape: 0 };
	const held = reading.kind === "shape" ? shape.matches.find((m) => m.match.kind === "exact") : undefined;
	if (held) target = { root: held.root, suffix: held.suffix, shape: held.voicingIndex };
	const batchItems = reading.kind === "batch" ? reading.tokens.map((t) => ({ token: t.token, shape: 0 })) : null;

	function add() {
		if (batchItems) onAdd(batchItems);
		else if (target) onAdd([{ token: chordSymbol(target.root, target.suffix), shape: target.shape }]);
		else return;
		setQuery("");
		inputRef.current?.focus();
	}
	function open() {
		if (target) goToChord({ root: target.root, suffix: target.suffix, category: "" });
	}

	return (
		<section className="hb-hero" aria-label="Look up chords">
			<h1 className="sr-only">Chords</h1>
			<div className="hb-ask">
				<Search className="hb-ask-icon" aria-hidden />
				<input
					ref={inputRef}
					className="hb-ask-input"
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") setQuery("");
						if (e.key !== "Enter") return;
						e.preventDefault();
						if (target && !batchItems) open();
						else add();
					}}
					placeholder="A chord, a few chords, or a shape"
					aria-label="Look up chords"
					autoComplete="off"
					spellCheck={false}
				/>
				{(target || batchItems) && (
					<div className="hb-ask-btns">
						{target && !batchItems && (
							<Button variant="secondary" size="sm" onClick={open}>
								Open {withGlyphs(chordSymbol(target.root, target.suffix))}
							</Button>
						)}
						<Button size="sm" onClick={add}>
							<Plus aria-hidden />
							{batchItems ? `Put ${batchItems.length} on the board` : "Add to board"}
						</Button>
					</div>
				)}
			</div>

			<div className="hb-reading" role="status" aria-live="polite">
				{reading.kind === "empty" && (
					<>
						<span className="hb-meta">Try</span>
						{EXAMPLES.map((example) => (
							<button key={example} type="button" className="hb-eg gp-focus" onClick={() => setQuery(example)}>
								{example}
							</button>
						))}
					</>
				)}
				{reading.kind === "batch" && (
					<span>
						Several chords:{" "}
						{reading.tokens.map((t, i) => (
							<b key={t.key} data-miss={t.status === "resolved" ? undefined : ""}>
								{i > 0 && " · "}
								{t.status === "resolved" ? withGlyphs(chordSymbol(t.root, t.suffix)) : t.token}
							</b>
						))}
					</span>
				)}
				{reading.kind === "shape" &&
					(shape.loading ? (
						<span className="hb-meta">Looking for that shape…</span>
					) : (
						<>
							<span>Held like this:</span>
							{shape.matches.slice(0, 4).map((m) => (
								<Link key={`${m.root}|${m.suffix}`} className="hb-hit gp-focus" href={chordHref(m.root, m.suffix)}>
									<b className="gp-title">{withGlyphs(chordSymbol(m.root, m.suffix))}</b>
									<span>{shapeMatchNote(m.match)}</span>
								</Link>
							))}
							{!held && (
								<Button asChild variant="secondary" size="xs">
									<Link href={`/chords/create?frets=${encodeURIComponent(trimmed)}`}>Not in the library — write it</Link>
								</Button>
							)}
						</>
					))}
				{reading.kind === "names" && (
					<>
						{reading.results.map((r) => (
							<Link key={`${r.root}|${r.suffix}`} className="hb-hit gp-focus" href={chordHref(r.root, r.suffix)}>
								<b className="gp-title">{withGlyphs(chordSymbol(r.root, r.suffix))}</b>
								<span>{chordQualityLine(r.root, r.suffix)}</span>
							</Link>
						))}
						{reading.shortcut && (
							<Button variant="ghost" size="xs" onClick={() => reading.shortcut && goToBrowse(reading.shortcut)}>
								{reading.shortcut.kind === "category" ? `Every ${reading.shortcut.category.toLowerCase()} chord ↓` : `All ${withGlyphs(reading.shortcut.root)} chords ↓`}
							</Button>
						)}
					</>
				)}
				{reading.kind === "none" && (
					<>
						<span>
							No chord called <b>{trimmed}</b>.
						</span>
						<ChordRequestButton key={trimmed} query={trimmed} label="Report it as missing" />
					</>
				)}
			</div>
		</section>
	);
}
