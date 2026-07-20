"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, CirclePlay, Loader2 } from "lucide-react";
import { CHORD_SUFFIX_CATEGORIES } from "@/lib/chordSuffixes";
import { createClient } from "@/lib/supabase";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { chordVoicingToMidi } from "@/lib/chordVoicingToMidi";
import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";
import {
	preloadFingerpickPresets,
	triggerChordPreview,
	CHORD_PREVIEW_DURATION_S,
	SOURCE_STOP_BUFFER_S,
} from "@/components/strum/useGuitarSampleLoader";

// ─── Piano layout ─────────────────────────────────────────────────────────────

const WHITE_KEYS = [
	{ root: "C", whiteIndex: 0 },
	{ root: "D", whiteIndex: 1 },
	{ root: "E", whiteIndex: 2 },
	{ root: "F", whiteIndex: 3 },
	{ root: "G", whiteIndex: 4 },
	{ root: "A", whiteIndex: 5 },
	{ root: "B", whiteIndex: 6 },
] as const;

// afterWhite: the index of the white key immediately to the left
const BLACK_KEYS = [
	{ root: "C#", afterWhite: 0 },
	{ root: "Eb", afterWhite: 1 },
	{ root: "F#", afterWhite: 3 },
	{ root: "Ab", afterWhite: 4 },
	{ root: "Bb", afterWhite: 5 },
] as const;

// ─── Category helpers ─────────────────────────────────────────────────────────

const CATEGORY_HINTS: Record<string, string> = {
	Major: "major, maj7, add9",
	Minor: "minor, m7, m9",
	"Dominant 7th": "7, 9, 13",
	Suspended: "sus2, sus4, 7sus4",
	Diminished: "dim, dim7",
	Augmented: "aug, aug7",
	"Power Chord": "5",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmedChord {
	root: string;
	suffix: string;
	pitches: number[];
}

interface Props {
	open: boolean;
	onClose: () => void;
	onConfirm: (chord: ConfirmedChord | null) => void;
	initialChord?: ConfirmedChord | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function voicingToSVGProps(v: ChordVoicing): {
	frets: number[];
	fingers: number[];
	startFret: number;
	barreFret: number | null;
} {
	const frets = v.frets.split("").map((c) => {
		if (c === "x") return -1;
		const rel = parseInt(c, 10);
		return rel === 0 ? 0 : v.start_fret + rel - 1;
	});
	const fingers = v.fingers.split("").map((c) => parseInt(c, 10) || 0);
	const barreFret = v.barre_fret !== null ? v.barre_fret + v.start_fret - 1 : null;
	return { frets, fingers, startFret: v.start_fret, barreFret };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChordPickerModal({ open, onClose, onConfirm, initialChord }: Props) {
	const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [selectedSuffix, setSelectedSuffix] = useState<string | null>(null);
	const [voicings, setVoicings] = useState<ChordVoicing[]>([]);
	const [selectedVoicingId, setSelectedVoicingId] = useState<string | null>(null);
	const [loadingVoicings, setLoadingVoicings] = useState(false);
	const [availableSuffixes, setAvailableSuffixes] = useState<string[]>([]);
	const [voicingsFor, setVoicingsFor] = useState<string | null>(null);

	const ctxRef = useRef<AudioContext | null>(null);
	const preloadRef = useRef<Promise<void> | null>(null);
	const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const voicingPanelRef = useRef<HTMLDivElement>(null);
	const [isPreloading, setIsPreloading] = useState(false);
	const [playingVoicingId, setPlayingVoicingId] = useState<string | null>(null);

	const phase2 = selectedRoot !== null && selectedCategory !== null;

	const voicingsKey = selectedRoot && selectedSuffix ? `${selectedRoot}|${selectedSuffix}` : null;
	const voicingsFetched = voicingsKey !== null && voicingsFor === voicingsKey;
	const showVoicingSpinner = voicingsKey !== null && !voicingsFetched;

	// Restore or reset when modal opens
	useEffect(() => {
		if (!open) return;
		if (initialChord) {
			const ic = initialChord;
			queueMicrotask(() => {
				setSelectedRoot(ic.root);
				const cat = CHORD_SUFFIX_CATEGORIES.find((c) =>
					(c.suffixes as readonly string[]).includes(ic.suffix),
				);
				setSelectedCategory(cat?.category ?? null);
				setSelectedSuffix(ic.suffix);
				setVoicingsFor(null);
			});
		} else {
			queueMicrotask(() => {
				setSelectedRoot(null);
				setSelectedCategory(null);
				setSelectedSuffix(null);
				setVoicings([]);
				setSelectedVoicingId(null);
				setAvailableSuffixes([]);
				setVoicingsFor(null);
			});
		}
	}, [open]); // eslint-disable-line react-hooks/exhaustive-deps

	// Cleanup audio on unmount
	useEffect(() => {
		return () => {
			if (playTimerRef.current !== null) clearTimeout(playTimerRef.current);
			ctxRef.current?.close().catch(() => undefined);
		};
	}, []);

	// Auto-scroll to voicing panel when phase 2 activates
	useEffect(() => {
		if (!phase2) return;
		const timer = setTimeout(() => {
			voicingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
		}, 100);
		return () => clearTimeout(timer);
	}, [phase2]);

	// When root or category changes: find available suffixes, update selectedSuffix
	useEffect(() => {
		if (!selectedRoot || !selectedCategory) return;
		const catDef = CHORD_SUFFIX_CATEGORIES.find((c) => c.category === selectedCategory);
		if (!catDef) return;
		const categorySuffixes = catDef.suffixes as readonly string[];
		let cancelled = false;

		(async () => {
			const supabase = createClient();
			const { data: rows } = await supabase
				.from("chords")
				.select("suffix")
				.eq("root", selectedRoot)
				.in("suffix", Array.from(categorySuffixes));

			if (cancelled) return;

			const available = (rows ?? [])
				.map((r) => r.suffix as string)
				.sort((a, b) => categorySuffixes.indexOf(a) - categorySuffixes.indexOf(b));

			setAvailableSuffixes(available);

			// Keep existing suffix if it's still valid in this category, else pick first available
			setSelectedSuffix((prev) => {
				if (prev && available.includes(prev)) return prev;
				return available[0] ?? null;
			});
		})().catch((err) => console.error("[ChordPickerModal]", err));

		return () => {
			cancelled = true;
		};
	}, [selectedRoot, selectedCategory]);

	// When root + suffix are both set: fetch voicings
	useEffect(() => {
		if (!selectedRoot || !selectedSuffix) return;
		let cancelled = false;

		(async () => {
			setLoadingVoicings(true);
			setVoicings([]);
			setSelectedVoicingId(null);
			const supabase = createClient();
			const { data: chord } = await supabase
				.from("chords")
				.select("chord_voicings(id, label, start_fret, barre_fret, capo, frets, fingers)")
				.eq("root", selectedRoot)
				.eq("suffix", selectedSuffix)
				.single();

			if (cancelled) return;

			const vs = (chord as { chord_voicings: ChordVoicing[] } | null)?.chord_voicings ?? [];
			setVoicings(vs);
			const standard = vs.find((v) => v.label === "Standard") ?? vs[0] ?? null;
			setSelectedVoicingId(standard?.id ?? null);
			setVoicingsFor(`${selectedRoot}|${selectedSuffix}`);
			setLoadingVoicings(false);
		})().catch((err) => {
			if (!cancelled) {
				console.error("[ChordPickerModal]", err);
				setVoicingsFor(`${selectedRoot}|${selectedSuffix}`);
				setLoadingVoicings(false);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [selectedRoot, selectedSuffix]);

	const handleSelectSuffix = useCallback(
		async (suffix: string) => {
			if (!selectedRoot) return;
			setSelectedSuffix(suffix);
		},
		[selectedRoot],
	);

	async function handlePlay(voicing: ChordVoicing) {
		const pitches = chordVoicingToMidi(voicing).map((n) => n.midi);
		if (pitches.length === 0) return;

		if (!ctxRef.current) {
			ctxRef.current = new AudioContext();
			setIsPreloading(true);
			preloadRef.current = preloadFingerpickPresets(ctxRef.current).finally(() =>
				setIsPreloading(false),
			);
		}
		if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
		await preloadRef.current;

		if (playTimerRef.current !== null) clearTimeout(playTimerRef.current);
		setPlayingVoicingId(voicing.id);
		triggerChordPreview(
			pitches,
			ctxRef.current,
			ctxRef.current.destination,
			ctxRef.current.currentTime,
		);
		playTimerRef.current = setTimeout(
			() => {
				setPlayingVoicingId(null);
				playTimerRef.current = null;
			},
			(CHORD_PREVIEW_DURATION_S + SOURCE_STOP_BUFFER_S) * 1000,
		);
	}

	function handleConfirm() {
		if (!selectedRoot || !selectedSuffix) return;
		const voicing = voicings.find((v) => v.id === selectedVoicingId) ?? voicings[0];
		if (!voicing) return;
		const pitches = chordVoicingToMidi(voicing).map((n) => n.midi);
		onConfirm({ root: selectedRoot, suffix: selectedSuffix, pitches });
	}

	return (
		<div
			className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 transition-opacity duration-200 ${
				open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
			}`}
			onClick={onClose}
		>
			<div
				className={`relative bg-popover border border-line-strong flex flex-col md:flex-row max-md:overflow-x-hidden max-md:overflow-y-auto max-md:overscroll-contain max-md:touch-pan-y max-md:max-h-[80dvh] md:overflow-hidden mx-4 max-md:w-72 transition-all duration-200 ${
					open ? "opacity-100 scale-100" : "opacity-0 scale-95"
				}`}
				style={{ maxWidth: "calc(100vw - 2rem)" }}
				onClick={(e) => e.stopPropagation()}
				onWheel={(e) => e.stopPropagation()}
				onTouchMove={(e) => e.stopPropagation()}
			>
				{/* Piano + category panel */}
				<div className="flex flex-col gap-4 p-6 shrink-0 md:w-72">
					<div className="flex items-center justify-between">
						<h2 className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
							Pick a chord
						</h2>
						<button
							onClick={onClose}
							className="text-ink-faint hover:text-ink hover:bg-raise transition-colors p-1"
							aria-label="Close"
						>
							<X size={16} />
						</button>
					</div>

					{/* Piano keyboard — visual treatment from ChordToc root-first sidebar */}
					<div className="relative h-16 w-full select-none">
						{/* White keys */}
						<div className="absolute inset-0 flex">
							{WHITE_KEYS.map((k) => (
								<button
									key={k.root}
									onClick={() => setSelectedRoot(k.root)}
									className={`flex-1 flex items-end justify-center pb-1 text-[7px] font-bold transition-colors border not-first:-ml-px ${
										selectedRoot === k.root
											? "relative z-10 bg-denim text-white border-denim"
											: "bg-background text-ink-faint border-line-strong hover:bg-denim-tint hover:text-denim"
									}`}
								>
									{k.root}
								</button>
							))}
						</div>
						{/* Black keys */}
						{BLACK_KEYS.map((k) => (
							<button
								key={k.root}
								onClick={() => setSelectedRoot(k.root)}
								className={`absolute top-0 z-10 h-[62%] flex items-end justify-center pb-0.5 text-[6px] font-bold transition-colors ${
									selectedRoot === k.root
										? "bg-denim text-white"
										: "bg-zinc-600 text-zinc-100 hover:bg-denim hover:text-on-denim"
								}`}
								style={{
									left: `${((k.afterWhite + 0.71) / 7) * 100}%`,
									width: `${(0.58 / 7) * 100}%`,
								}}
							>
								{k.root}
							</button>
						))}
					</div>

					{/* Category grid */}
					<div className="grid grid-cols-2 gap-2">
						{CHORD_SUFFIX_CATEGORIES.map((cat) => (
							<button
								key={cat.category}
								onClick={() => {
									if (cat.category === selectedCategory) return;
									setSelectedCategory(cat.category);
									setSelectedSuffix(null);
									setVoicings([]);
									setSelectedVoicingId(null);
									setAvailableSuffixes([]);
									setVoicingsFor(null);
								}}
								className={`text-left border px-3 py-2.5 transition-all ${
									selectedCategory === cat.category
										? "border-denim bg-denim-tint"
										: "border-line-strong hover:border-denim hover:bg-denim-tint/50"
								}`}
							>
								<div
									className={`text-xs font-semibold ${
										selectedCategory === cat.category
											? "text-denim"
											: "text-ink"
									}`}
								>
									{cat.category}
								</div>
								<div className="text-[10px] text-ink-faint mt-0.5">
									{CATEGORY_HINTS[cat.category] ??
										(cat.suffixes as readonly string[]).slice(0, 3).join(", ")}
								</div>
							</button>
						))}
					</div>

					{!phase2 && (
						<p className="text-[10px] text-ink-faint text-center">
							Select a root and category
						</p>
					)}
				</div>

				{/* Voicing panel — expands downward on mobile, rightward on desktop */}
				<div
					ref={voicingPanelRef}
					className={`overflow-hidden shrink-0 ${phase2 ? "max-md:max-h-125 md:max-w-[320px]" : "max-md:max-h-0 md:max-w-0"}`}
					style={{
						transition:
							"max-height 350ms cubic-bezier(0.32, 0.72, 0, 1), max-width 350ms cubic-bezier(0.32, 0.72, 0, 1)",
					}}
				>
					<div className="flex flex-col gap-4 px-6 pb-6 pt-4 border-t border-line md:border-t-0 md:border-l md:w-80 md:h-full md:justify-center">
						{/* Suffix tabs */}
						{availableSuffixes.length > 1 && (
							<div className="flex flex-wrap gap-1">
								{availableSuffixes.map((s) => (
									<button
										key={s}
										onClick={() => void handleSelectSuffix(s)}
										className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
											selectedSuffix === s
												? "bg-denim text-on-denim"
												: "bg-raise text-ink-dim hover:bg-denim-tint hover:text-denim"
										}`}
									>
										{s}
									</button>
								))}
							</div>
						)}

						{/* Chord name */}
						{selectedRoot && selectedSuffix && (
							<p className="text-sm font-semibold text-ink">
								{selectedRoot} {selectedSuffix}
							</p>
						)}

						{/* Voicing cards — horizontal scroll, ~1.5 cards visible */}
						<div>
							{showVoicingSpinner ? (
								<div className="flex items-center gap-2 justify-center py-6">
									<Loader2 size={18} className="animate-spin text-ink-faint" />
									<span className="text-xs text-ink-faint">Checking…</span>
								</div>
							) : !showVoicingSpinner && voicings.length === 0 ? (
								<p className="text-xs text-ink-faint text-center py-6">
									No voicings found
								</p>
							) : voicings.length > 0 ? (
								<div className="flex gap-3 overflow-x-auto pb-2">
									{voicings.map((v) => {
										const svgProps = voicingToSVGProps(v);
										const isSelected = selectedVoicingId === v.id;
										const isPlaying = playingVoicingId === v.id;
										return (
											<div
												key={v.id}
												onClick={() => setSelectedVoicingId(v.id)}
												className={`w-36 shrink-0 flex flex-col items-center gap-1.5 cursor-pointer p-2 border-2 transition-all ${
													isSelected
														? "border-denim"
														: "border-transparent hover:border-line-strong"
												}`}
											>
												<ChordDiagramSVG {...svgProps} size="compact" />
												<div className="flex items-center gap-1">
													<span className="text-[9px] text-ink-faint max-w-15 truncate">
														{v.label ?? "—"}
													</span>
													<button
														onClick={(e) => {
															e.stopPropagation();
															void handlePlay(v);
														}}
														disabled={isPreloading}
														className={`transition-colors motion-safe:enabled:hover:animate-[play-bounce-hop_0.35s_ease-out] ${
															isPlaying
																? "text-denim-accent"
																: "text-denim hover:text-denim-accent"
														}`}
														aria-label="Preview chord"
													>
														{isPreloading && isPlaying ? (
															<Loader2
																size={11}
																className="animate-spin"
															/>
														) : (
															<CirclePlay size={11} />
														)}
													</button>
												</div>
											</div>
										);
									})}
								</div>
							) : null}
						</div>

						{/* Confirm / Clear buttons */}
						<div className="flex gap-2">
							{initialChord && (
								<button
									onClick={() => onConfirm(null)}
									className="flex-1 py-2 border border-line-strong text-ink-dim text-sm font-semibold hover:border-denim hover:text-denim-accent active:bg-denim-tint transition-colors"
								>
									Clear
								</button>
							)}
							<button
								onClick={handleConfirm}
								disabled={voicings.length === 0}
								className="flex-1 py-2 bg-denim text-on-denim text-sm font-semibold hover:bg-denim-accent active:bg-denim-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
							>
								Confirm
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
