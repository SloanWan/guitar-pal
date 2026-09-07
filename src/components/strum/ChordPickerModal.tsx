"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, CirclePlay, Loader2 } from "lucide-react";
import {
	CHORD_SUFFIX_CATEGORIES,
	UNKNOWN_ROOT,
	UNKNOWN_SUFFIX,
	chordDisplayName,
} from "@/lib/chordSuffixes";
import type { ChordRef } from "@/lib/strumPatterns";
import { createClient } from "@/lib/supabase";
import { loadVoicings } from "@/lib/chordVoicingCache";
import { useUser } from "@/hooks/useUser";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import {
	UNKNOWN_CATEGORY,
	hasUnknownChords,
	isUserVoicingId,
	mergeVoicings,
	userSuffixesFiledUnder,
	userVoicingCategory,
} from "@/lib/userChordVoicings";
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

/**
 * Where the player's own chords live in the browse list.
 *
 * A chord written for a shape the library never had belongs to no quality
 * category — that is usually why it was written — so browsing by category alone
 * would hide it for good. Its own section is the only honest home for it.
 */
const MINE_CATEGORY = "Mine";

/** Where the piano opens for a chord that belongs to no key. */
const BROWSE_START_ROOT = "C";

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
	/** The voicing the user actually picked, so a stored ChordRef can pin it. */
	voicingId?: string | null;
}

interface Props {
	open: boolean;
	onClose: () => void;
	onConfirm: (chord: ConfirmedChord | null) => void;
	/** Only root/suffix are read, so a stored ChordRef works as-is. */
	initialChord?: ChordRef | null;
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
	const [libraryVoicings, setLibraryVoicings] = useState<ChordVoicing[]>([]);
	const { user, loading: userLoading } = useUser();
	const { voicings: userVoicings, deleteVoicing } = useUserChordVoicings(user, userLoading);
	/**
	 * What the player may choose from: the library's shapes, then their own.
	 * Merged here rather than in the fetch so a shape saved a moment ago appears
	 * without another round trip, and so saving one cannot reset the selection.
	 */
	/**
	 * The root the chord is stored under, which is the placeholder for one nobody
	 * has named — the piano key is how the player got here, not what they picked.
	 */
	const chordRoot = selectedSuffix === UNKNOWN_SUFFIX ? UNKNOWN_ROOT : selectedRoot;
	const voicings: ChordVoicing[] = useMemo(
		() =>
			chordRoot && selectedSuffix
				? mergeVoicings(libraryVoicings, userVoicings, chordRoot, selectedSuffix)
				: libraryVoicings,
		[libraryVoicings, userVoicings, chordRoot, selectedSuffix],
	);
	/**
	 * Sections of the player's own, offered beside the taxonomy: the chords they
	 * filed nowhere in particular, and the ones nobody has named yet. Both are
	 * held apart from the categories because neither is a quality.
	 */
	const ownSections = selectedRoot
		? [
				{ category: MINE_CATEGORY, suffixes: userSuffixesFiledUnder(userVoicings, selectedRoot, null) },
				// Unnamed chords belong to no root, so the section is the same one
				// under every key rather than being hidden behind guessing which root
				// a chord nobody has identified might turn out to have.
				{
					category: UNKNOWN_CATEGORY,
					suffixes: hasUnknownChords(userVoicings) ? [UNKNOWN_SUFFIX] : [],
				},
			].filter((section) => section.suffixes.length > 0)
		: [];
	/** Their own chords filed under the category being browsed, if any. */
	const filedHereSuffixes =
		selectedRoot && selectedCategory && !ownSections.some((s) => s.category === selectedCategory)
			? userSuffixesFiledUnder(userVoicings, selectedRoot, selectedCategory)
			: [];
	// Serialized, so the suffix effect keys on the chords themselves rather than
	// on arrays rebuilt by every render.
	const ownSectionsKey = JSON.stringify(ownSections);
	const filedHereKey = filedHereSuffixes.join("|");
	const categories = [...CHORD_SUFFIX_CATEGORIES, ...ownSections];

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
	// Primitive, so it can sit in the voicing-fetch deps without re-running on
	// every render of the parent.
	const initialVoicingId = initialChord?.voicingId ?? null;

	const voicingsKey = selectedRoot && selectedSuffix ? `${selectedRoot}|${selectedSuffix}` : null;
	const voicingsFetched = voicingsKey !== null && voicingsFor === voicingsKey;
	const showVoicingSpinner = voicingsKey !== null && !voicingsFetched;

	// Restore or reset when modal opens
	useEffect(() => {
		if (!open) return;
		if (initialChord) {
			const ic = initialChord;
			queueMicrotask(() => {
				setVoicingsFor(null);
				setSelectedSuffix(ic.suffix);

				// An unnamed chord is filed under no root, so the piano opens on a key
				// only because the browse has to start somewhere — the section it
				// leads to is the same under every one of them.
				if (ic.root === UNKNOWN_ROOT) {
					setSelectedRoot(BROWSE_START_ROOT);
					setSelectedCategory(UNKNOWN_CATEGORY);
					return;
				}

				setSelectedRoot(ic.root);
				const cat = CHORD_SUFFIX_CATEGORIES.find((c) =>
					(c.suffixes as readonly string[]).includes(ic.suffix),
				);
				// A chord of the player's own opens wherever they filed it.
				const mine = userVoicings.find(
					(v) => v.root === ic.root && v.suffix === ic.suffix,
				);
				setSelectedCategory(
					cat?.category ??
						(mine ? (userVoicingCategory(mine) ?? MINE_CATEGORY) : null),
				);
			});
		} else {
			queueMicrotask(() => {
				setSelectedRoot(null);
				setSelectedCategory(null);
				setSelectedSuffix(null);
				setLibraryVoicings([]);
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

		// The player's own chords are already in hand — there is nothing in the
		// library to ask for, and a query for suffixes it does not carry would
		// come back empty and clear the section.
		const own = (
			JSON.parse(ownSectionsKey) as { category: string; suffixes: string[] }[]
		).find((section) => section.category === selectedCategory);
		if (own) {
			queueMicrotask(() => {
				setAvailableSuffixes(own.suffixes);
				setSelectedSuffix((prev) =>
					prev && own.suffixes.includes(prev) ? prev : (own.suffixes[0] ?? null),
				);
			});
			return;
		}

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

			const library = (rows ?? [])
				.map((r) => r.suffix as string)
				.sort((a, b) => categorySuffixes.indexOf(a) - categorySuffixes.indexOf(b));
			// A chord the player filed here is offered here, whether or not the
			// library carries anything by that name — filing it is what filing means.
			const filed = filedHereKey === "" ? [] : filedHereKey.split("|");
			const available = [...library, ...filed.filter((s) => !library.includes(s))];

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
	}, [selectedRoot, selectedCategory, ownSectionsKey, filedHereKey]);

	// When root + suffix are both set: fetch voicings
	useEffect(() => {
		if (!selectedRoot || !selectedSuffix) return;
		let cancelled = false;

		(async () => {
			setLoadingVoicings(true);
			setLibraryVoicings([]);
			setSelectedVoicingId(null);
			// Through the shared cache: a chord already resolved for playback or
			// for a diagram opens the picker with no round trip at all. An unnamed
			// chord is nobody's but the player's, so the library is not asked.
			const vs =
				selectedSuffix === UNKNOWN_SUFFIX ? [] : await loadVoicings(selectedRoot, selectedSuffix);

			if (cancelled) return;

			setLibraryVoicings(vs);
			// Reopen on the voicing the bar was saved with; falls through to
			// Standard when the pinned id belongs to a different chord.
			const pinned = initialVoicingId
				? vs.find((v) => v.id === initialVoicingId)
				: undefined;
			const preselected = pinned ?? vs.find((v) => v.label === "Standard") ?? vs[0] ?? null;
			setSelectedVoicingId(preselected?.id ?? null);
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
	}, [selectedRoot, selectedSuffix, initialVoicingId]);

	/**
	 * A pinned shape of the player's own is not in the library fetch, so it is
	 * selected once their shapes have loaded rather than in the fetch effect.
	 */
	useEffect(() => {
		if (!initialVoicingId || !isUserVoicingId(initialVoicingId)) return;
		if (selectedVoicingId === initialVoicingId) return;
		if (!voicings.some((v) => v.id === initialVoicingId)) return;
		// Deferred rather than set in the effect body: the shapes arrive after the
		// library fetch has already chosen a selection, and setting state straight
		// back inside an effect is the cascading-render pattern the repo defers
		// elsewhere for the same reason.
		queueMicrotask(() => setSelectedVoicingId(initialVoicingId));
	}, [voicings, initialVoicingId, selectedVoicingId]);


	function handleDeleteShape(id: string) {
		deleteVoicing(id);
		// Fall back rather than leaving a selection pointing at nothing.
		if (selectedVoicingId === id) setSelectedVoicingId(null);
	}

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
		if (!chordRoot || !selectedSuffix) return;
		const voicing = voicings.find((v) => v.id === selectedVoicingId) ?? voicings[0];
		if (!voicing) return;
		const pitches = chordVoicingToMidi(voicing).map((n) => n.midi);
		onConfirm({
			root: chordRoot,
			suffix: selectedSuffix,
			pitches,
			voicingId: voicing.id,
		});
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
						{categories.map((cat) => (
							<button
								key={cat.category}
								onClick={() => {
									if (cat.category === selectedCategory) return;
									setSelectedCategory(cat.category);
									setSelectedSuffix(null);
									setLibraryVoicings([]);
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
						{chordRoot && selectedSuffix && (
							<p className="text-sm font-semibold text-ink">
								{chordDisplayName(chordRoot, selectedSuffix)}
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
														{v.label ?? (isUserVoicingId(v.id) ? "Mine" : "—")}
													</span>
													{isUserVoicingId(v.id) && (
														<button
															onClick={(e) => {
																e.stopPropagation();
																handleDeleteShape(v.id);
															}}
															aria-label="Delete this shape"
															title="Delete this shape"
															className="text-ink-faint transition-colors hover:text-destructive"
														>
															<X size={10} />
														</button>
													)}
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
