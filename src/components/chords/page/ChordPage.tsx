"use client";

import "./chord-page.css";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AudioLines, ChevronLeft, ChevronRight, Library, PanelRightOpen, Pencil, Play, Plus, Trash2 } from "lucide-react";
import Link from "@/components/AppLink";
import ChordDiagramSVG, { type DiagramMode } from "@/components/chords/ChordDiagramSVG";
import { ARPEGGIO_GAP_S, useChordPreview } from "@/components/chords/useChordPreview";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { useUser } from "@/hooks/useUser";
import type { VoicingCard } from "@/lib/chordCards";
import { degreeName, withGlyphs, type ChordTone } from "@/lib/chordFormulas";
import { chordQualityLine, clampShape, pageShapes } from "@/lib/chordPage";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { chordShapeToVoicing, diagramToChordShape, emptyChordShape, suggestFingers } from "@/lib/chordShape";
import { UNKNOWN_ROOT, chordSymbol, displayCategory } from "@/lib/chordSuffixes";
import { rootPitchClass, voicingPitches } from "@/lib/chordVoicingToMidi";
import type { ChordWithVoicings } from "@/lib/chordsData";
import { shouldRunPageShortcut } from "@/lib/keyboardShortcuts";
import { userVoicingId } from "@/lib/userChordVoicings";
import ChordLibrary from "./ChordLibrary";
import ChordNeck from "./ChordNeck";
import ShapeDraft, { draftTitle, type Draft } from "./ShapeDraft";

/** Per-viewer: whether the library beside the stage is folded away. */
const LIBRARY_FOLDED_KEY = "chordLibraryFolded";
/** Below this the library is a sheet rather than a column (the page's own width). */
const SIDE_LIBRARY_MIN_WIDTH = 960;

const DOT_MODES: { value: DiagramMode; label: string }[] = [
	{ value: "fingers", label: "123" },
	{ value: "noteNames", label: "ABC" },
	{ value: "fretboard", label: "Grid" },
];

export interface ChordPageProps {
	root: string;
	suffix: string;
	/** The chord's tones, root first; null for a chord the formula table does not know. */
	tones: readonly ChordTone[] | null;
	/** The note a slash chord names for its bass. */
	slashBass: string | null;
	/** The library's shapes, standard first; empty for a chord only the player has. */
	library: readonly VoicingCard[];
	index: readonly ChordIndexEntry[];
	/** The chord's root's chords, for the library list. */
	rootChords: readonly ChordWithVoicings[];
}

/**
 * One chord on the stage: its tones, its shapes one at a time and side by side,
 * and the chord library beside it to move to the next one.
 */
export default function ChordPage({ root, suffix, tones, slashBass, library, index, rootChords }: ChordPageProps) {
	const { user, loading } = useUser();
	const { voicings: userVoicings, saveVoicing, deleteVoicing } = useUserChordVoicings(user, loading);
	const mine = useMemo(() => userVoicings.filter((v) => v.root === root && v.suffix === suffix), [userVoicings, root, suffix]);
	const shapes = useMemo(() => pageShapes(library, mine, root, suffix), [library, mine, root, suffix]);

	// Held by id, so a shape saved or deleted elsewhere in the list does not move the selection.
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const found = shapes.findIndex((s) => s.id === selectedId);
	const at = found >= 0 ? found : 0;
	const shape = shapes[at] ?? null;
	const [mode, setMode] = useState<DiagramMode>("fingers");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [draft, setDraft] = useState<Draft | null>(null);
	const preview = useChordPreview();
	/** The shape the last arpeggio was played on: its plucks are drawn only while that shape is shown. */
	const [arpeggioOf, setArpeggioOf] = useState<string | null>(null);

	const symbol = chordSymbol(root, suffix);
	const rootMidi = rootPitchClass(root);

	function select(index: number) {
		setSelectedId(shapes[clampShape(index, shapes.length)]?.id ?? null);
		setConfirmDelete(false);
	}

	// Left and right page the shapes, space plays the one shown, wherever focus is on the page.
	const { play } = preview;
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (!shouldRunPageShortcut(e)) return;
			const to = e.key === "ArrowLeft" ? at - 1 : e.key === "ArrowRight" ? at + 1 : null;
			if (to !== null) {
				setSelectedId(shapes[clampShape(to, shapes.length)]?.id ?? null);
				setConfirmDelete(false);
			} else if (e.code === "Space" && shapes[at]) {
				e.preventDefault();
				void play(shapes[at].pitches);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [at, shapes, play]);

	const [folded, setFolded] = useState(false);
	useEffect(() => {
		try {
			if (localStorage.getItem(LIBRARY_FOLDED_KEY) === "1") queueMicrotask(() => setFolded(true));
		} catch {
			// unreadable storage: the library starts open
		}
	}, []);
	function fold(next: boolean) {
		setFolded(next);
		try {
			localStorage.setItem(LIBRARY_FOLDED_KEY, next ? "1" : "0");
		} catch {
			// remembered for this visit only
		}
	}
	const [sheetOpen, setSheetOpen] = useState(false);
	const layoutRef = useRef<HTMLDivElement>(null);

	/** Draw a shape — a copy of the one shown, or one of the player's own to redraw. */
	function openDraft(editing: boolean) {
		const own = editing && shape ? mine.find((v) => v.id === shape.id) : undefined;
		let start = shape ? diagramToChordShape(shape.def) : emptyChordShape();
		if (!shape) start = { ...start, fingers: suggestFingers(start) };
		setDraft({ editingId: own?.id ?? null, shape: start, name: own?.label ?? "" });
		if ((layoutRef.current?.offsetWidth ?? 0) < SIDE_LIBRARY_MIN_WIDTH) setSheetOpen(true);
		else if (folded) fold(false);
	}
	function closeDraft() {
		setDraft(null);
		setSheetOpen(false);
	}
	function saveDraft() {
		if (!draft) return;
		const own = draft.editingId ? mine.find((v) => v.id === draft.editingId) : undefined;
		const stored = saveVoicing({
			...chordShapeToVoicing(draft.shape, draft.editingId ?? userVoicingId(crypto.randomUUID()), draft.name.trim() || null),
			root,
			suffix,
			...(own?.category ? { category: own.category } : {}),
		});
		setSelectedId(stored.id);
		closeDraft();
	}

	const libraryProps = { root, suffix, index, initialChords: rootChords, userVoicings };
	const drawer = (variant: "aside" | "sheet") =>
		draft ? (
			<ShapeDraft
				variant={variant}
				chordName={symbol}
				draft={draft}
				onChange={setDraft}
				onSave={saveDraft}
				onHear={() => void preview.play(voicingPitches(chordShapeToVoicing(draft.shape, "preview")))}
				onCancel={closeDraft}
			/>
		) : null;

	const category = root === UNKNOWN_ROOT ? "Mine" : displayCategory(suffix);
	const omitted = new Set(shape?.omits ?? []);

	return (
		<div className="ch-page" ref={layoutRef}>
			<div className="ch-shell" data-lib={folded ? "closed" : "open"}>
				<div className="ch-stage-wrap">
					{folded && (
						<button
							type="button"
							className="ch-icon ch-lib-fab gp-focus"
							onClick={() => fold(false)}
							aria-label="Show the chord library"
							title="Show the chord library"
							aria-expanded={false}
						>
							<PanelRightOpen aria-hidden />
						</button>
					)}
					<div className="ch-stage">
						<div className="ch-stage-in ch-rise">
							<nav className="ch-crumbs" aria-label="Breadcrumb" style={{ "--i": 0 } as CSSProperties}>
								<Button asChild variant="ghost" size="xs">
									<Link href="/chords">
										<ChevronLeft aria-hidden />
										Chords
									</Link>
								</Button>
								{root !== UNKNOWN_ROOT && <span className="ch-lab">/ {withGlyphs(root)}</span>}
								<span className="flex-1" />
								<Button variant="secondary" size="xs" className="ch-libbtn" onClick={() => setSheetOpen(true)}>
									<Library aria-hidden />
									Library
								</Button>
							</nav>

							<header className="ch-title" style={{ "--i": 0 } as CSSProperties}>
								<span className="ch-lab">
									{category}
									{root !== UNKNOWN_ROOT && ` · ${withGlyphs(root)} root`}
								</span>
								<h1>{withGlyphs(symbol)}</h1>
								<span className="ch-meta">
									{chordQualityLine(root, suffix)} · {shapes.length} shape{shapes.length === 1 ? "" : "s"}
								</span>
							</header>

							{shape ? (
								<section className="ch-main" aria-label={`${symbol}, ${shape.label}`} style={{ "--i": 1 } as CSSProperties}>
									{tones && (
										<ol className="ch-tones" aria-label="Chord tones">
											{tones.map((tone, i) => (
												<li
													key={tone.semitones}
													className="ch-tone"
													data-root={i === 0 ? "" : undefined}
													data-gone={omitted.has(tone.degree === "1" ? "root" : tone.degree) ? "" : undefined}
												>
													<b>{tone.note}</b>
													<span className="ch-dgr">{tone.degree}</span>
													<span className="ch-dname">{degreeName(tone.degree)}</span>
												</li>
											))}
											{slashBass && <li className="ch-meta ch-bass">over {withGlyphs(slashBass)} in the bass</li>}
										</ol>
									)}
									<div className="ch-center">
										<Button variant="icon" size="sm" aria-label="Previous shape" disabled={at === 0} onClick={() => select(at - 1)}>
											<ChevronLeft aria-hidden />
										</Button>
										<span className="ch-big" role="img" aria-label={`${symbol}, ${shape.label}`}>
											<ChordDiagramSVG
												{...shape.def}
												mode={mode}
												rootMidi={rootMidi}
												rootTone
												size="large"
												pluck={
													preview.playing === "arpeggio" && arpeggioOf === shape.id
														? { run: preview.arpeggioRun, gapS: ARPEGGIO_GAP_S }
														: null
												}
											/>
										</span>
										<Button
											variant="icon"
											size="sm"
											aria-label="Next shape"
											disabled={at === shapes.length - 1}
											onClick={() => select(at + 1)}
										>
											<ChevronRight aria-hidden />
										</Button>
									</div>
									<div className="ch-side">
										<div className="flex flex-col gap-0.5">
											<span className="ch-vlabel">{shape.label}</span>
											<span className="ch-meta">
												Shape {at + 1} of {shapes.length}
											</span>
											{shape.caption && <span className="ch-meta">{shape.caption}</span>}
											{shape.note && <span className="ch-note-line">{shape.note}</span>}
											<span className="ch-tab">{shape.tab}</span>
										</div>
										{/* Labels that never change, so neither button moves while samples load or a chord rings. */}
										<div className="ch-plays">
											<Button
												onClick={() => void preview.play(shape.pitches)}
												loading={preview.isPreloading}
												aria-pressed={preview.playing === "strum"}
											>
												<Play aria-hidden />
												Play
											</Button>
											<Button
												variant="secondary"
												onClick={() => {
													setArpeggioOf(shape.id);
													void preview.arpeggiate(shape.pitches);
												}}
												loading={preview.isPreloading}
												aria-pressed={preview.playing === "arpeggio"}
											>
												<AudioLines aria-hidden />
												Arpeggio
											</Button>
										</div>
										{shape.mine &&
											(confirmDelete ? (
												<div className="flex items-center gap-1.5">
													<span className="ch-meta">Delete it?</span>
													<Button
														variant="danger"
														size="xs"
														onClick={() => {
															deleteVoicing(shape.id);
															setSelectedId(null);
															setConfirmDelete(false);
														}}
													>
														Delete
													</Button>
													<Button variant="ghost" size="xs" onClick={() => setConfirmDelete(false)}>
														Keep
													</Button>
												</div>
											) : (
												<div className="flex items-center gap-1">
													<Button variant="ghost" size="xs" onClick={() => openDraft(true)}>
														<Pencil aria-hidden />
														Redraw
													</Button>
													<Button variant="ghost" size="xs" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${shape.label}`}>
														<Trash2 aria-hidden />
														Delete
													</Button>
												</div>
											))}
										<div className="flex flex-col gap-1">
											<span className="ch-lab">Dots show</span>
											<Segmented options={DOT_MODES} value={mode} onChange={setMode} label="What the dots show" dense />
										</div>
									</div>
								</section>
							) : (
								<section className="ch-empty" style={{ "--i": 1 } as CSSProperties}>
									<p className="m-0">
										The library has no shape for {withGlyphs(symbol)}. Draw your own and it plays like any other.
									</p>
									<Button variant="secondary" onClick={() => openDraft(false)}>
										<Plus aria-hidden />
										Draw a shape
									</Button>
								</section>
							)}

							{shapes.length > 0 && (
								<section className="ch-shapes" aria-label="Every shape" style={{ "--i": 2 } as CSSProperties}>
									<div className="ch-shapes-head">
										<h2>Shapes</h2>
										<span className="ch-meta">{mine.length > 0 ? "yours sit at the end" : "the library's, standard first"}</span>
										<span className="flex-1" />
										<Button variant="secondary" size="xs" onClick={() => openDraft(false)}>
											<Plus aria-hidden />
											My own shape
										</Button>
									</div>
									<div className="ch-film">
										{shapes.map((s, i) => (
											<button
												key={s.id}
												type="button"
												className="ch-shape gp-focus"
												aria-pressed={i === at}
												aria-label={`Shape ${i + 1}: ${s.label}`}
												onClick={() => select(i)}
											>
												<span className="ch-shape-dg" aria-hidden>
													<ChordDiagramSVG {...s.def} rootMidi={rootMidi} rootTone size="compact" />
												</span>
												<span className="ch-shape-label gp-title">{s.label}</span>
												{s.mine && <span className="ch-chip">Mine</span>}
											</button>
										))}
									</div>
								</section>
							)}

							{shape && (
								<section className="ch-neck-wrap" aria-label="On the neck" style={{ "--i": 3 } as CSSProperties}>
									<div className="ch-shapes-head">
										<h2>On the neck</h2>
										<span className="ch-meta">every tone up to the 15th fret · the box is this shape</span>
									</div>
									<ChordNeck symbol={withGlyphs(symbol)} rootPc={rootMidi ?? -1} tones={tones} shapes={shapes} at={at} onSelect={select} />
								</section>
							)}

							<p className="ch-credit" style={{ "--i": 4 } as CSSProperties}>
								Voicing data via{" "}
								<a href="https://github.com/tombatossals/chords-db" target="_blank" rel="noopener noreferrer">
									tombatossals/chords-db
								</a>{" "}
								· audio samples via{" "}
								<a href="https://github.com/surikov/webaudiofontdata" target="_blank" rel="noopener noreferrer">
									WebAudioFont
								</a>
							</p>
						</div>
					</div>
				</div>

				<aside className="ch-lib" aria-label={draft ? "My own shape" : "Chord library"}>
					{!folded && (drawer("aside") ?? <ChordLibrary {...libraryProps} variant="aside" onFold={() => fold(true)} />)}
				</aside>
			</div>

			<Sheet
				open={sheetOpen}
				onOpenChange={(open) => (open ? setSheetOpen(true) : closeDraft())}
				title={draft ? `${draftTitle(draft)} · ${withGlyphs(symbol)}` : "Chord library"}
			>
				<div className="ch-sheet" data-m="chords">
					{drawer("sheet") ?? <ChordLibrary {...libraryProps} variant="sheet" onNavigate={() => setSheetOpen(false)} />}
				</div>
			</Sheet>
		</div>
	);
}
