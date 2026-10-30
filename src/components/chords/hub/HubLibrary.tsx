"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "@/components/AppLink";
import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";
import PianoRoots from "@/components/chords/PianoRoots";
import CornerButton from "./CornerButton";
import type { FavouriteChords } from "@/components/chords/useFavouriteChords";
import { NavCard } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PickToggle } from "@/components/ui/pick-toggle";
import { Segmented } from "@/components/ui/segmented";
import { useNavRouter } from "@/components/nav-progress";
import { buildRootSections } from "@/lib/chordBrowseSections";
import type { BoardItem } from "@/lib/chordBoard";
import { withGlyphs } from "@/lib/chordFormulas";
import { favouriteKey, type FavouriteChord } from "@/lib/favouriteChords";
import { chordQualityLine } from "@/lib/chordPage";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { chordHref } from "@/lib/chordSlug";
import { CHORD_SUFFIX_CATEGORIES, ROOT_CHROMATIC_ORDER, chordSymbol, isSlashChord } from "@/lib/chordSuffixes";
import { voicingToDiagramShape, type ChordVoicing, type DiagramShape } from "@/lib/chordVoicing";
import { loadVoicings } from "@/lib/chordVoicingCache";
import { rootPitchClass } from "@/lib/chordVoicingToMidi";
import type { ChordWithVoicings } from "@/lib/chordsData";
import { hubCategoryId, hubQualityHref, hubRootHref, hubViewHref, qualityLabel, type HubView } from "@/lib/chordsHub";
import { selectStandardVoicing } from "@/lib/selectStandardVoicing";
import { mergeVoicings, type UserChordVoicing } from "@/lib/userChordVoicings";

// Read under the switcher's label, "Browse by": short enough that five fit on a phone.
const VIEWS: { value: HubView; label: string }[] = [
	{ value: "root", label: "Root" },
	{ value: "quality", label: "Quality" },
	{ value: "table", label: "Table" },
	{ value: "mine", label: "Mine" },
	{ value: "favourites", label: "Favourites" },
];

interface Props {
	view: HubView;
	root: string;
	quality: string;
	/** The root's chords ("By root") or the quality's chords ("By quality"), as the server read them. */
	chords: readonly ChordWithVoicings[];
	index: readonly ChordIndexEntry[];
	userVoicings: readonly UserChordVoicing[];
	favourites: FavouriteChords;
	onAdd: (items: BoardItem[]) => void;
}

interface Card {
	root: string;
	suffix: string;
	/** Undefined while it is still being read. */
	def: DiagramShape | null | undefined;
	subline?: string;
}

/**
 * Each kept chord's standard shape. The server reads the other views' chords;
 * favourites are the player's, so their shapes are read here, once each.
 */
function useStandardShapes(chords: readonly FavouriteChord[], userVoicings: readonly UserChordVoicing[], active: boolean) {
	const [library, setLibrary] = useState<Record<string, ChordVoicing[]>>({});
	useEffect(() => {
		if (!active) return;
		const missing = chords.filter((c) => library[favouriteKey(c.root, c.suffix)] === undefined);
		if (missing.length === 0) return;
		let cancelled = false;
		Promise.all(
			missing.map((c) =>
				loadVoicings(c.root, c.suffix)
					.catch(() => [])
					.then((voicings) => [favouriteKey(c.root, c.suffix), voicings] as const),
			),
		).then((read) => {
			if (!cancelled) setLibrary((prev) => ({ ...prev, ...Object.fromEntries(read) }));
		});
		return () => {
			cancelled = true;
		};
	}, [active, chords, library]);
	return (root: string, suffix: string): DiagramShape | null | undefined => {
		const read = library[favouriteKey(root, suffix)];
		if (read === undefined) return undefined;
		const voicing = selectStandardVoicing(mergeVoicings(read, userVoicings, root, suffix));
		return voicing ? voicingToDiagramShape(voicing) : null;
	};
}

/** Every chord to browse from the hub, as cards that open the chord or go on the board. */
export default function HubLibrary({ view, root, quality, chords, index, userVoicings, favourites, onAdd }: Props) {
	const router = useNavRouter();
	const pending = router.pending;
	const go = (href: string) => router.push(href, { scroll: false });
	const keptShape = useStandardShapes(favourites.favourites, userVoicings, view === "favourites");

	const card = ({ root: r, suffix: s, def, subline }: Card) => {
		const name = withGlyphs(chordSymbol(r, s));
		return (
			<div key={`${r}|${s}`} className="hb-lc">
				<NavCard asChild className="hb-chord">
					<Link href={chordHref(r, s)}>
						<span className="hb-chord-name gp-title">{name}</span>
						<span className="hb-chord-q">{subline ?? chordQualityLine(r, s)}</span>
						<span className="hb-chord-dg" data-loading={def === undefined ? "" : undefined} aria-hidden>
							{def ? <ChordDiagramSVG {...def} rootMidi={rootPitchClass(r)} size="compact" /> : null}
						</span>
					</Link>
				</NavCard>
				{/* Add by the name, the pick under it by the quality; later in order, so its hit area wins where they meet. */}
				<div className="hb-acts">
					<CornerButton
						kind="add"
						className="hb-pin"
						label={`Put ${name} on the board`}
						onClick={() => onAdd([{ token: chordSymbol(r, s), shape: 0 }])}
					/>
					<PickToggle
						className="hb-fav"
						pressed={favourites.isFavourite(r, s)}
						onPressedChange={() => favourites.toggle(r, s)}
						label={`Favourite ${name}`}
					/>
				</div>
			</div>
		);
	};
	const standardDef = (chord: ChordWithVoicings) => {
		const voicing = selectStandardVoicing(chord.chord_voicings);
		return voicing ? voicingToDiagramShape(voicing) : null;
	};

	let body: React.ReactNode;
	if (view === "root") {
		body = buildRootSections(chords).map((section) => (
			<section key={section.label} id={hubCategoryId(section.label)} className="hb-group" aria-label={section.label}>
				<h3>{section.label}</h3>
				<div className="hb-grid">{section.cards.map((c) => card({ root: c.root, suffix: c.suffix, def: c.def }))}</div>
			</section>
		));
	} else if (view === "quality") {
		const order = (c: ChordWithVoicings) => ROOT_CHROMATIC_ORDER.indexOf(c.root);
		const sorted = [...chords].sort((a, b) => order(a) - order(b));
		body = (
			<section className="hb-group" aria-label={chordQualityLine("C", quality)}>
				<h3>{chordQualityLine("C", quality)} in every key</h3>
				<div className="hb-grid">{sorted.map((c) => card({ root: c.root, suffix: c.suffix, def: standardDef(c) }))}</div>
			</section>
		);
	} else if (view === "table") {
		const has = new Set(index.map((e) => `${e.root}|${e.suffix}`));
		const slashSuffixes = [...new Set(index.filter((e) => isSlashChord(e.suffix)).map((e) => e.suffix))].sort();
		const rows = [
			...CHORD_SUFFIX_CATEGORIES.map((c) => ({ label: c.category, suffixes: c.suffixes })),
			{ label: "Slash Chords", suffixes: slashSuffixes },
		];
		body = (
			<div className="hb-table-wrap">
				<table className="hb-table">
					<thead>
						<tr>
							<th scope="col">
								<span className="sr-only">Quality</span>
							</th>
							{ROOT_CHROMATIC_ORDER.map((r) => (
								<th key={r} scope="col">
									{withGlyphs(r)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((group) => (
							<Fragment key={group.label}>
								<tr className="hb-table-cat">
									<th colSpan={13} scope="rowgroup">
										<span>{group.label}</span>
									</th>
								</tr>
								{group.suffixes.map((s) => (
									<tr key={s}>
										<th scope="row">{isSlashChord(s) ? s : chordQualityLine("C", s)}</th>
										{ROOT_CHROMATIC_ORDER.map((r) => (
											<td key={r}>
												{has.has(`${r}|${s}`) && (
													<Link className="gp-focus" href={chordHref(r, s)}>
														{withGlyphs(chordSymbol(r, s))}
													</Link>
												)}
											</td>
										))}
									</tr>
								))}
							</Fragment>
						))}
					</tbody>
				</table>
			</div>
		);
	} else if (view === "favourites") {
		const kept = favourites.favourites;
		body = favourites.favouritesLoading ? (
			<p className="hb-meta">Loading your favourites…</p>
		) : kept.length === 0 ? (
			<p className="hb-meta">
				Nothing kept yet. Tap the pick on any chord — here or on its page — and it waits for you here, on every device you
				sign in on.
			</p>
		) : (
			<section className="hb-group" aria-label="Favourites">
				<h3>Chords you keep</h3>
				<div className="hb-grid">{kept.map((c) => card({ root: c.root, suffix: c.suffix, def: keptShape(c.root, c.suffix) }))}</div>
			</section>
		);
	} else {
		const seen = new Set<string>();
		const own = userVoicings.filter((v) => {
			const key = `${v.root}|${v.suffix}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		body =
			own.length === 0 ? (
				<p className="hb-meta">
					Nothing written yet. Draw a shape on any chord&apos;s page, or type six frets above — first string first — to
					write down a chord the library lacks.
				</p>
			) : (
				<section className="hb-group" aria-label="My chords">
					<h3>Shapes you wrote</h3>
					<div className="hb-grid">
						{own.map((v) => card({ root: v.root, suffix: v.suffix, def: voicingToDiagramShape(v), subline: v.label ?? "Mine" }))}
					</div>
				</section>
			);
	}

	return (
		<section className="hb-library" aria-label="Library" aria-busy={pending || undefined}>
			<div className="hb-library-head">
				<h2>Library</h2>
				<Segmented options={VIEWS} value={view} onChange={(next) => go(hubViewHref(next, root, quality))} label="Browse by" dense />
			</div>
			{view === "root" && <PianoRoots value={root} onChange={(next) => go(hubRootHref(next))} />}
			{view === "quality" && (
				<div className="hb-qualities" role="group" aria-label="Quality">
					{CHORD_SUFFIX_CATEGORIES.map((category, ci) => (
						<Fragment key={category.category}>
							{ci > 0 && (
								<span className="hb-sep" aria-hidden>
									|
								</span>
							)}
							{category.suffixes.map((s) => (
								<Chip key={s} pressed={s === quality} title={chordQualityLine("C", s)} onPressedChange={() => go(hubQualityHref(s))}>
									{qualityLabel(s)}
								</Chip>
							))}
						</Fragment>
					))}
				</div>
			)}
			<div className="hb-library-body" data-pending={pending ? "" : undefined}>
				{body}
			</div>
		</section>
	);
}
