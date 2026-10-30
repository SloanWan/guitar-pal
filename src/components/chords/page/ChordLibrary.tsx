"use client";

import { useEffect, useMemo, useState } from "react";
import { PanelRightClose } from "lucide-react";
import Link from "@/components/AppLink";
import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";
import PianoRoots from "@/components/chords/PianoRoots";
import { useChordShapeMatches } from "@/components/chords/useChordShapeMatches";
import type { FavouriteChords } from "@/components/chords/useFavouriteChords";
import { ListRow } from "@/components/ui/list-row";
import { PickToggle } from "@/components/ui/pick-toggle";
import { SearchInput } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { buildRootSections, type BrowseSection } from "@/lib/chordBrowseSections";
import { boardHref, buildChordLookup, classifyBatchQuery } from "@/lib/chordBatchResolve";
import { withGlyphs } from "@/lib/chordFormulas";
import { chordQualityLine } from "@/lib/chordPage";
import { searchChords, type ChordIndexEntry } from "@/lib/chordSearch";
import { shapeMatchNote } from "@/lib/chordShapeSearch";
import { chordHref } from "@/lib/chordSlug";
import { ROOT_CHROMATIC_ORDER, chordSymbol } from "@/lib/chordSuffixes";
import type { ChordWithVoicings } from "@/lib/chordsData";
import { chordIndexWithUser, type UserChordVoicing } from "@/lib/userChordVoicings";

type Filter = "all" | "mine" | "favourites";

const FILTERS: { value: Filter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "mine", label: "Mine" },
	{ value: "favourites", label: "Favourites" },
];

interface Props {
	/** The chord the page is on. */
	root: string;
	suffix: string;
	/** Every browsable chord name, for the search. */
	index: readonly ChordIndexEntry[];
	/** The page's root's chords, so the list draws without a round trip. */
	initialChords: readonly ChordWithVoicings[];
	userVoicings: readonly UserChordVoicing[];
	favourites: FavouriteChords;
	/** Beside the stage it has a heading and folds away; in a sheet the sheet has both. */
	variant: "aside" | "sheet";
	onFold?: () => void;
	/** A row was followed (the sheet closes on it). */
	onNavigate?: () => void;
}

/** Every chord to move to from this page: a search, the roots as a keyboard, and the list. */
export default function ChordLibrary({
	root,
	suffix,
	index,
	initialChords,
	userVoicings,
	favourites,
	variant,
	onFold,
	onNavigate,
}: Props) {
	const knownRoot = ROOT_CHROMATIC_ORDER.includes(root);
	const [listRoot, setListRoot] = useState(knownRoot ? root : "C");
	const [filter, setFilter] = useState<Filter>(knownRoot ? "all" : "mine");
	const [query, setQuery] = useState("");
	const [byRoot, setByRoot] = useState<Record<string, readonly ChordWithVoicings[]>>(() =>
		knownRoot ? { [root]: initialChords } : {},
	);

	useEffect(() => {
		if (byRoot[listRoot]) return;
		let cancelled = false;
		// Imported here so the server action stays out of the page's first chunk.
		import("@/lib/chords")
			.then(({ getChordsByRoot }) => getChordsByRoot(listRoot))
			.then((chords) => {
				if (!cancelled) setByRoot((prev) => ({ ...prev, [listRoot]: chords }));
			})
			.catch((e: unknown) => console.error("[ChordLibrary] chords by root:", e));
		return () => {
			cancelled = true;
		};
	}, [listRoot, byRoot]);

	const sections: BrowseSection[] = useMemo(
		() => (byRoot[listRoot] ? buildRootSections(byRoot[listRoot]) : []),
		[byRoot, listRoot],
	);
	const searchIndex = useMemo(() => chordIndexWithUser(index, userVoicings), [index, userVoicings]);
	const lookup = useMemo(() => buildChordLookup(index), [index]);
	const trimmed = query.trim();
	const shape = useChordShapeMatches(query);
	const batch = trimmed ? classifyBatchQuery(lookup, query) : null;
	const named = trimmed && !shape.target && !batch?.shouldOffer ? searchChords(searchIndex, query, 20) : [];

	const current = (r: string, s: string) => r === root && s === suffix;
	// A row and its pick, side by side as the Strum library's are.
	const row = (key: string, r: string, s: string, subline: string, diagram?: BrowseSection["cards"][number]["def"]) => (
		<div key={key} className="ch-lrow">
			<ListRow
				asChild
				title={chordSymbol(r, s)}
				subline={subline}
				selected={current(r, s)}
				trailing={
					diagram ? (
						<span className="ch-mini" aria-hidden>
							<ChordDiagramSVG {...diagram} size="compact" />
						</span>
					) : undefined
				}
			>
				<Link href={chordHref(r, s)} onClick={onNavigate} />
			</ListRow>
			<PickToggle
				pressed={favourites.isFavourite(r, s)}
				onPressedChange={() => favourites.toggle(r, s)}
				label={`Favourite ${withGlyphs(chordSymbol(r, s))}`}
			/>
		</div>
	);

	let body: React.ReactNode;
	if (shape.target) {
		body = shape.loading ? (
			<p className="ch-lab ch-note">Looking for that shape…</p>
		) : shape.matches.length === 0 ? (
			<p className="ch-lab ch-note">Nothing in the library is held like that.</p>
		) : (
			shape.matches.map((m) => row(`shape-${m.root}-${m.suffix}`, m.root, m.suffix, shapeMatchNote(m.match)))
		);
	} else if (batch?.shouldOffer) {
		body = (
			<Link className="ch-note ch-link gp-focus" href={boardHref(trimmed)} onClick={onNavigate}>
				Put {batch.tokens.length} chords on the board →
			</Link>
		);
	} else if (trimmed) {
		body =
			named.length === 0 ? (
				<p className="ch-lab ch-note">No chord called “{trimmed}”.</p>
			) : (
				named.map((r) => row(`${r.root}|${r.suffix}`, r.root, r.suffix, chordQualityLine(r.root, r.suffix)))
			);
	} else if (filter === "favourites") {
		body = favourites.favouritesLoading ? (
			<p className="ch-lab ch-note">Loading…</p>
		) : favourites.favourites.length === 0 ? (
			<p className="ch-lab ch-note">Chords you keep with the pick land here.</p>
		) : (
			favourites.favourites.map((f) => row(`fav-${f.root}|${f.suffix}`, f.root, f.suffix, chordQualityLine(f.root, f.suffix)))
		);
	} else if (filter === "mine") {
		const seen = new Set<string>();
		const mine = userVoicings.filter((v) => {
			const key = `${v.root}|${v.suffix}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		body =
			mine.length === 0 ? (
				<p className="ch-lab ch-note">Shapes you draw land here.</p>
			) : (
				mine.map((v) => row(`mine-${v.root}|${v.suffix}`, v.root, v.suffix, chordQualityLine(v.root, v.suffix)))
			);
	} else if (!byRoot[listRoot]) {
		body = <p className="ch-lab ch-note">Loading…</p>;
	} else {
		body = sections.map((section) => (
			<section key={section.label} aria-label={section.label} className="ch-group">
				<h3 className="ch-lgrp">{section.label}</h3>
				{section.cards.map((card) => row(card.key, card.root, card.suffix, chordQualityLine(card.root, card.suffix), card.def))}
			</section>
		));
	}

	return (
		<>
			{variant === "aside" && (
				<div className="flex items-center gap-1.5">
					<h2 className="m-0 flex-1 text-base font-bold">Chord library</h2>
					{onFold && (
						<button
							type="button"
							className="ch-icon gp-focus"
							onClick={onFold}
							aria-label="Fold the chord library"
							title="Fold the chord library"
							aria-expanded
						>
							<PanelRightClose aria-hidden />
						</button>
					)}
				</div>
			)}
			<SearchInput
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder="Am7 · C Am F G · 01023x"
				aria-label="Find a chord"
			/>
			<PianoRoots
				wide
				value={filter === "all" && !trimmed ? listRoot : null}
				onChange={(next) => {
					setListRoot(next);
					setFilter("all");
					setQuery("");
				}}
			/>
			<Segmented options={FILTERS} value={filter} onChange={setFilter} label="Show" full />
			<div className="ch-list">{body}</div>
		</>
	);
}
