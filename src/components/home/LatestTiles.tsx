"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, Grid3x3, ListMusic } from "lucide-react";
import Link from "@/components/AppLink";
import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";
import { NavCard } from "@/components/ui/card";
import { ModuleBadge } from "@/components/ui/list-row";
import type { Book } from "@/lib/books/types";
import { withGlyphs } from "@/lib/chordFormulas";
import { chordHref } from "@/lib/chordSlug";
import { chordSymbol } from "@/lib/chordSuffixes";
import { voicingToDiagramShape, type DiagramShape } from "@/lib/chordVoicing";
import { loadVoicings } from "@/lib/chordVoicingCache";
import { rootPitchClass } from "@/lib/chordVoicingToMidi";
import type { HomeTab, KeptChord } from "@/lib/home/loadHome";
import { whenLabel } from "@/lib/home/home";
import type { ModuleKey } from "@/lib/moduleForPath";
import { selectStandardVoicing } from "@/lib/selectStandardVoicing";
import { beatUnitGlyph } from "@/lib/strumMeter";
import MiniTab from "./MiniTab";

interface TileProps {
	href: string;
	module: ModuleKey;
	icon: typeof BookOpen;
	/** "Tab", said first on the tile's top line. */
	kind: string;
	when: string;
	preview: ReactNode;
	title: string;
	subline: string;
}

/** One latest thing: the thing is the title, its module only a quiet badge. */
function Tile({ href, module, icon, kind, when, preview, title, subline }: TileProps) {
	return (
		<NavCard asChild className="hm-tile" data-m={module}>
			<Link href={href}>
				<ModuleBadge icon={icon} className="gp-badge-quiet" />
				<span className="hm-tile-m">
					<b>{kind}</b> · {when}
				</span>
				<span className="hm-tile-p">{preview}</span>
				<span className="hm-tile-t">
					<span className="hm-tile-name gp-title">{title}</span>
					<span className="hm-tile-s">{subline}</span>
				</span>
			</Link>
		</NavCard>
	);
}

/** The standard shape of each chord, read once each; undefined while on its way, null for none. */
function useShapes(chords: readonly KeptChord[]): (DiagramShape | null | undefined)[] {
	const key = chords.map((c) => `${c.root}|${c.suffix}`).join(",");
	const [shapes, setShapes] = useState<Record<string, DiagramShape | null>>({});
	useEffect(() => {
		let cancelled = false;
		const wanted = key === "" ? [] : key.split(",");
		Promise.all(
			wanted.map(async (k) => {
				const [root, suffix] = k.split("|");
				const voicing = selectStandardVoicing(await loadVoicings(root, suffix).catch(() => []));
				return [k, voicing ? voicingToDiagramShape(voicing) : null] as const;
			}),
		).then((read) => {
			if (!cancelled) setShapes(Object.fromEntries(read));
		});
		return () => {
			cancelled = true;
		};
	}, [key]);
	return chords.map((c) => shapes[`${c.root}|${c.suffix}`]);
}

function bookLine(book: Book): string {
	const pages = book.page_count ?? 0;
	if (book.status === "scanning") return `Scanning · ${book.scanned_pages} of ${pages} pages`;
	if (book.status === "ready") return `${pages} pages, ready`;
	if (book.status === "failed") return "Could not be read";
	return "Uploaded, not scanned yet";
}

interface Props {
	tab: HomeTab | null;
	chords: readonly KeptChord[];
	shapes: number;
	book: Book | null;
	now: Date | null;
}

/** The three latest things the player touched beside the strum: a tab, a chord, a book. */
export default function LatestTiles({ tab, chords, shapes, book, now }: Props) {
	const shown = chords.slice(0, 3);
	const diagrams = useShapes(shown);
	const when = (iso: string | null, verb: string) => (iso && now ? `${verb} ${whenLabel(new Date(iso), now)}` : verb);

	const tiles: ReactNode[] = [];
	if (tab) {
		const ts = tab.pattern.timeSignature;
		tiles.push(
			<Tile
				key="tab"
				href={`/fingerpick?pattern=${encodeURIComponent(tab.pattern.id)}`}
				module="tab"
				icon={ListMusic}
				kind="Tab"
				when={when(tab.openedAt, "opened")}
				preview={<MiniTab pattern={tab.pattern} />}
				title={tab.pattern.name}
				subline={`${tab.custom ? "Yours" : "Preset"} · ${beatUnitGlyph(ts)} = ${tab.pattern.bpm}`}
			/>,
		);
	}
	if (shown.length > 0) {
		const latest = shown[0];
		const kept = `${chords.length} kept chord${chords.length === 1 ? "" : "s"}`;
		tiles.push(
			<Tile
				key="chords"
				href={chordHref(latest.root, latest.suffix)}
				module="chords"
				icon={Grid3x3}
				kind="Chords"
				when={when(latest.createdAt, "kept")}
				preview={
					<span className="hm-shapes">
						{shown.map((c, i) => {
							const def = diagrams[i];
							return (
								<span key={`${c.root}|${c.suffix}`} className="hm-shape">
									{def ? <ChordDiagramSVG {...def} rootMidi={rootPitchClass(c.root)} size="compact" /> : null}
									{withGlyphs(chordSymbol(c.root, c.suffix))}
								</span>
							);
						})}
					</span>
				}
				title={withGlyphs(chordSymbol(latest.root, latest.suffix))}
				subline={shapes > 0 ? `${kept} · ${shapes} shape${shapes === 1 ? "" : "s"} of yours` : kept}
			/>,
		);
	}
	if (book) {
		const progress = book.page_count ? Math.round((100 * book.scanned_pages) / book.page_count) : 0;
		tiles.push(
			<Tile
				key="book"
				href={`/books/${book.id}`}
				module="books"
				icon={BookOpen}
				kind="Books"
				when={when(book.created_at, "added")}
				preview={
					<span className="hm-pages" aria-hidden>
						<i />
						<i />
						<i />
						<span className="hm-meter" style={{ "--p": `${progress}%` } as CSSProperties}>
							<span />
						</span>
					</span>
				}
				title={book.title}
				subline={bookLine(book)}
			/>,
		);
	}
	if (tiles.length === 0) return null;
	return <div className="hm-latest">{tiles}</div>;
}
