"use client";

import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { FingerpickPattern, StringFret, Measure } from "@/lib/fingerpickTypes";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import {
	useFingerpickAudioEngine,
	type MetronomeSubdivision,
} from "@/components/fingerpick/useFingerpickAudioEngine";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CirclePlay, CirclePause, CircleStop, X, SquareMenu, Plus, Minus } from "lucide-react";

// ── StringFret factory helpers ──────────────────────────────────────────────
// Reduce the verbosity of the required { fret, technique, tied, muted } shape.
const S = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const N = (fret: number): StringFret => ({ fret, technique: null, tied: false, muted: false });
const Hn = (fret: number): StringFret => ({
	fret,
	technique: "hammer-on",
	tied: false,
	muted: false,
});
const Po = (fret: number): StringFret => ({
	fret,
	technique: "pull-off",
	tied: false,
	muted: false,
});
const Su = (fret: number): StringFret => ({
	fret,
	technique: "slide-up",
	tied: false,
	muted: false,
});
const Sd = (fret: number): StringFret => ({
	fret,
	technique: "slide-down",
	tied: false,
	muted: false,
});
const Ti = (fret: number): StringFret => ({ fret, technique: null, tied: true, muted: false });
const Mx = (): StringFret => ({ fret: null, technique: null, tied: false, muted: true });

// ── Preset pattern ─────────────────────────────────────────────────────────
// Exercises every supported technique and all five duration values in one pattern.
//
// m1 — quarter notes: normal frets + muted ("x") note
// m2 — eighth notes + beams: hammer-on (h) and pull-off (p) on D string
// m3 — quarter notes: slide-up (/), tied arc, slide-down (\) on A string
// m4 — half + quarter rest + four sixteenth notes on high-e (exercises half, rest, sixteenth)
// m5 — single whole note on G string (exercises whole)
//
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]
const PRESET_FINGERPICK_PATTERN: FingerpickPattern = {
	id: "technique-showcase",
	name: "Technique Showcase",
	bpm: 80,
	timeSignature: [4, 4],
	measures: [
		// ── m1: quarter notes — normal frets, muted note ────────────────
		{
			id: "m1",
			slots: [
				{ id: "s01", duration: "quarter", strings: [S(), S(), S(), S(), S(), N(5)] },
				{ id: "s02", duration: "quarter", strings: [S(), S(), S(), S(), S(), Mx()] },
				{ id: "s03", duration: "quarter", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "s04", duration: "quarter", strings: [S(), S(), S(), S(), N(2), S()] },
			],
		},

		// ── m2: eighth notes — beams, hammer-on, pull-off on D string ────
		{
			id: "m2",
			slots: [
				{ id: "s05", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "s06", duration: "eighth", strings: [S(), S(), S(), Hn(2), S(), S()] },
				{ id: "s07", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "s08", duration: "eighth", strings: [S(), S(), S(), Po(0), S(), S()] },
				{ id: "s09", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "s10", duration: "eighth", strings: [S(), S(), S(), Hn(2), S(), S()] },
				{ id: "s11", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "s12", duration: "eighth", strings: [S(), S(), S(), Po(0), S(), S()] },
			],
		},

		// ── m3: quarter notes — slide-up, tied arc, slide-down on A ──────
		{
			id: "m3",
			slots: [
				{ id: "s13", duration: "quarter", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "s14", duration: "quarter", strings: [S(), S(), S(), S(), Su(5), S()] },
				{ id: "s15", duration: "quarter", strings: [S(), S(), S(), S(), Ti(5), S()] },
				{ id: "s16", duration: "quarter", strings: [S(), S(), S(), S(), Sd(0), S()] },
			],
		},

		// ── m4: half + rest + 4 sixteenth notes (2 + 1 + 1 = 4 beats) ───
		{
			id: "m4",
			slots: [
				{ id: "s17", duration: "half", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s18", duration: "rest", strings: [S(), S(), S(), S(), S(), S()] },
				{ id: "s19", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s20", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s21", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s22", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
			],
		},

		// ── m5: whole note — G string open (4 beats) ─────────────────────
		{
			id: "m5",
			slots: [{ id: "s23", duration: "whole", strings: [S(), S(), N(0), S(), S(), S()] }],
		},
	],
};

// groupMeasuresIntoRows — pure function.
// Splits a flat measures array into row-sized chunks for layout.
//
// Unit-test examples:
//   groupMeasuresIntoRows([m1,m2,m3,m4,m5], 4) → [[m1,m2,m3,m4],[m5]]
//   groupMeasuresIntoRows([m1,m2,m3],       2) → [[m1,m2],[m3]]
//   groupMeasuresIntoRows([],               4) → []
//   groupMeasuresIntoRows([m1],             4) → [[m1]]
function groupMeasuresIntoRows(measures: Measure[], perRow: number): Measure[][] {
	const rows: Measure[][] = [];
	for (let i = 0; i < measures.length; i += perRow) {
		rows.push(measures.slice(i, i + perRow));
	}
	return rows;
}

const LOOP_GAP_OPTIONS = [0, 5, 10] as const;
type LoopGapSeconds = (typeof LOOP_GAP_OPTIONS)[number];

const MIN_BPM = 40;
const MAX_BPM = 220;

export default function FingerpickPage() {
	const [showLibrary, setShowLibrary] = useState(false);
	const [pattern] = useState<FingerpickPattern>(PRESET_FINGERPICK_PATTERN);
	const [loopGap, setLoopGap] = useState<LoopGapSeconds>(0);
	const [bpm, setBpm] = useState<number>(PRESET_FINGERPICK_PATTERN.bpm);
	const tapTimesRef = useRef<number[]>([]);

	const {
		isLoaded,
		isPlaying,
		isPaused,
		load,
		play,
		pause,
		resume,
		stop,
		metronomeEnabled,
		setMetronomeEnabled,
		metronomeSubdivision,
		setMetronomeSubdivision,
		metronomeGain,
		setMetronomeGain,
		accentEnabled,
		setAccentEnabled,
		noteGain,
		setNoteGain,
		applyBpmChange,
	} = useFingerpickAudioEngine();

	// Preload presets on mount so the first Play is instant.
	// load() is stable in intent but re-created each render; the empty-dep array
	// is intentional — we only want one preload call per page mount.
	useEffect(() => {
		void load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function handlePlay() {
		play({ ...pattern, bpm }, { loop: true, loopGapSeconds: loopGap });
	}

	function handlePlayPause() {
		if (isPlaying) {
			pause();
		} else if (isPaused) {
			resume();
		} else {
			handlePlay();
		}
	}

	function handleBpmChange(newBpm: number) {
		const clamped = Math.min(MAX_BPM, Math.max(MIN_BPM, newBpm));
		setBpm(clamped);
		applyBpmChange(clamped);
	}

	function handleTapTempo() {
		const now = performance.now();
		const taps = tapTimesRef.current;

		if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
			tapTimesRef.current = [];
		}

		tapTimesRef.current = [...tapTimesRef.current, now].slice(-8);

		if (tapTimesRef.current.length < 2) return;

		const intervals = tapTimesRef.current
			.slice(1)
			.map((t, i) => t - tapTimesRef.current[i]);
		const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
		const rawBpm = Math.round(60000 / avgInterval);
		handleBpmChange(rawBpm);
	}

	// Spacebar toggles Play/Pause. Skips when focus is inside a text/select element.
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLSelectElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;
			if (e.code === "Space") {
				e.preventDefault();
				handlePlayPause();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isPlaying, isPaused, isLoaded, bpm, loopGap]);

	// Desktop (≥768 px): 4 measures per row; mobile: 2.
	// useSyncExternalStore handles SSR (server snapshot = 4) and client updates
	// (media query change callbacks) without a setState-in-effect pattern.
	const measuresPerRow = useSyncExternalStore(
		(onStoreChange) => {
			const mq = window.matchMedia("(min-width: 768px)");
			mq.addEventListener("change", onStoreChange);
			return () => mq.removeEventListener("change", onStoreChange);
		},
		() => (window.matchMedia("(min-width: 768px)").matches ? 4 : 2),
		() => 4,
	);

	// Each entry carries the row's measures and the 1-indexed measure number for
	// its first cell, so TabStaveRow can label measures correctly.
	const rows = useMemo(
		() =>
			groupMeasuresIntoRows(pattern.measures, measuresPerRow).reduce<
				Array<{ measures: Measure[]; startMeasureNumber: number }>
			>((acc, rowMeasures) => {
				const prev = acc.at(-1);
				const startMeasureNumber = prev
					? prev.startMeasureNumber + prev.measures.length
					: 1;
				return [...acc, { measures: rowMeasures, startMeasureNumber }];
			}, []),
		[pattern.measures, measuresPerRow],
	);

	return (
		<div className="md:h-[calc(100vh-3.5rem)] flex flex-col md:flex-row md:overflow-hidden bg-slate-50">
			{/* Left sidebar — lg: static; below lg: slide-in overlay */}
			<div
				className={`fixed inset-y-0 left-0 z-40 w-72 h-full border-r border-slate-200 bg-white flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:translate-x-0 ${
					showLibrary ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-slate-200">
					<h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
						Pattern Library
					</h2>
					<button
						onClick={() => setShowLibrary(false)}
						className="lg:hidden h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
					>
						<X size={18} />
					</button>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<p className="text-xs text-slate-400 text-center px-4">
						Pattern library coming soon
					</p>
				</div>
			</div>

			{/* Backdrop — tap outside to close library on mobile/tablet */}
			{showLibrary && (
				<div
					className="fixed inset-0 z-30 bg-black/20 lg:hidden"
					onClick={() => setShowLibrary(false)}
				/>
			)}

			{/* Centre — TAB viewer
			    md: fixed-height column → inner wrapper fills it (flex-1 + min-h-0)
			    → title is shrink-0 → measures scroll vertically inside min-h-0 container.
			    Mobile: no height constraint, page scroll handles overflow naturally. */}
			<div className="md:flex-1 flex flex-col px-4 md:px-8 py-6 md:py-8 md:overflow-hidden">
				<div className="relative w-full max-w-4xl mx-auto flex flex-col min-h-0 md:flex-1">
					<div className="mb-4 shrink-0">
						<h1 className="text-lg font-semibold text-slate-700">{pattern.name}</h1>
						<p className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">
							{bpm} BPM &middot; {pattern.timeSignature[0]}/
							{pattern.timeSignature[1]}
						</p>
					</div>

					{/* min-h-0 lets Flexbox shrink this child so overflow-y-auto scrolls.
					    Each TabStaveRow is a full-width row of measures rendered into one
					    VexFlow context; the row count and width are driven by the viewport. */}
					<div className="min-h-0 overflow-y-auto bg-white rounded-xl border border-slate-100">
						<div className="flex flex-col">
							{rows.map((row) => (
								<TabStaveRow
									key={row.measures[0].id}
									measures={row.measures}
									startMeasureNumber={row.startMeasureNumber}
								/>
							))}
						</div>
					</div>

					{/* Mobile library toggle */}
					{!showLibrary && (
						<button
							onClick={() => setShowLibrary(true)}
							className="absolute top-0 right-0 lg:hidden flex items-center gap-2 text-white text-sm font-semibold rounded-md px-2 py-2 shadow-lg transition-all duration-200 active:scale-95"
							style={{ backgroundColor: "var(--denim)" }}
						>
							<SquareMenu />
						</button>
					)}
				</div>
			</div>

			{/* Right panel — controls */}
			<div className="w-full border-t border-slate-200 bg-white md:w-55 md:border-t-0 md:border-l lg:w-70 md:h-full md:shrink-0 flex flex-col">
				<h2 className="w-full px-5 py-4 shrink-0 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
					Controls
				</h2>

				<div className="flex flex-col gap-5 px-5 py-5 overflow-y-auto">
					{/* Play / Pause toggle */}
					<div
						onClick={isLoaded ? handlePlayPause : undefined}
						className={`flex items-center justify-center transition-all duration-150 active:scale-95 ${
							isLoaded
								? "cursor-pointer text-denim hover:text-denim-dark"
								: "opacity-30 pointer-events-none text-denim"
						}`}
					>
						{isPlaying ? (
							<CirclePause size={56} strokeWidth={1.5} />
						) : (
							<CirclePlay size={56} strokeWidth={1.5} />
						)}
					</div>

					{/* Stop button — shown while playing or paused */}
					{(isPlaying || isPaused) && (
						<button
							onClick={stop}
							className="flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 transition-colors duration-150 text-xs font-medium"
						>
							<CircleStop size={16} strokeWidth={1.5} />
							Stop
						</button>
					)}

					{!isLoaded && (
						<p className="text-[10px] text-slate-400 text-center">
							Loading samples…
						</p>
					)}

					{/* BPM slider */}
					<input
						type="range"
						min={MIN_BPM}
						max={MAX_BPM}
						value={bpm}
						onChange={(e) => handleBpmChange(Number(e.target.value))}
						className="w-full accent-denim cursor-pointer"
					/>

					{/* ±10 BPM + display */}
					<div className="flex justify-between items-center">
						<Button
							variant="outline"
							className="h-10 w-10 p-0 rounded-full border-slate-200 hover:border-denim hover:text-denim transition-colors duration-150"
							onClick={() => handleBpmChange(bpm - 10)}
						>
							<Minus size={16} />
						</Button>
						<div className="flex flex-col items-center gap-0.5">
							<span className="text-5xl font-bold tracking-tight text-denim">
								{bpm}
							</span>
							<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
								BPM
							</span>
						</div>
						<Button
							variant="outline"
							className="h-10 w-10 p-0 rounded-full border-slate-200 hover:border-denim hover:text-denim transition-colors duration-150"
							onClick={() => handleBpmChange(bpm + 10)}
						>
							<Plus size={16} />
						</Button>
					</div>

					{/* Tap Tempo */}
					<Button
						onClick={handleTapTempo}
						className="h-9 w-full text-sm font-semibold cursor-pointer transition-all duration-150"
						style={{ backgroundColor: "var(--denim)", color: "white" }}
					>
						Tap Tempo
					</Button>

					{/* Loop gap */}
					<div className="flex flex-col gap-2">
						<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							Loop Gap
						</span>
						<div className="flex gap-1">
							{LOOP_GAP_OPTIONS.map((gap) => (
								<Button
									key={gap}
									variant={loopGap === gap ? "default" : "outline"}
									onClick={() => setLoopGap(gap)}
									className="flex-1 h-9 text-xs font-semibold transition-colors duration-150"
									style={
										loopGap === gap
											? { backgroundColor: "var(--denim)", color: "white" }
											: undefined
									}
								>
									{gap}s
								</Button>
							))}
						</div>
					</div>

					<div className="border-t border-slate-100" />

					{/* Metronome toggle */}
					<div className="flex items-center justify-between">
						<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
							Metronome
						</span>
						<Switch
							checked={metronomeEnabled}
							onCheckedChange={setMetronomeEnabled}
							className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-slate-200"
						/>
					</div>

					{/* Accent beat 1 toggle */}
					<div
						className={`flex items-center justify-between transition-opacity duration-200 ${
							!metronomeEnabled ? "opacity-40" : ""
						}`}
					>
						<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							Accent beat 1
						</span>
						<Switch
							checked={accentEnabled}
							disabled={!metronomeEnabled}
							onCheckedChange={setAccentEnabled}
							className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-slate-200"
						/>
					</div>

					{/* Subdivision density */}
					<div
						className={`flex flex-col gap-2 transition-opacity duration-200 ${
							!metronomeEnabled ? "opacity-40" : ""
						}`}
					>
						<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							Subdivision
						</span>
						<div className="flex gap-1">
							{(
								[
									{ value: "quarter", label: "1/4" },
									{ value: "eighth", label: "1/8" },
									{ value: "sixteenth", label: "1/16" },
								] satisfies { value: MetronomeSubdivision; label: string }[]
							).map(({ value, label }) => (
								<Button
									key={value}
									variant={metronomeSubdivision === value ? "default" : "outline"}
									disabled={!metronomeEnabled}
									onClick={() => setMetronomeSubdivision(value)}
									className="flex-1 h-9 text-xs font-semibold transition-colors duration-150"
									style={
										metronomeSubdivision === value
											? { backgroundColor: "var(--denim)", color: "white" }
											: undefined
									}
								>
									{label}
								</Button>
							))}
						</div>
					</div>

					{/* Metronome volume */}
					<div
						className={`flex flex-col gap-1.5 transition-opacity duration-200 ${
							!metronomeEnabled ? "opacity-40" : ""
						}`}
					>
						<div className="flex justify-between items-center">
							<span className="text-xs text-slate-400">Metronome vol.</span>
							<span className="text-xs tabular-nums text-slate-400">
								{Math.round(metronomeGain * 100)}%
							</span>
						</div>
						<input
							type="range"
							min={0}
							max={1}
							step={0.01}
							value={metronomeGain}
							disabled={!metronomeEnabled}
							onChange={(e) => setMetronomeGain(Number(e.target.value))}
							className="w-full accent-denim cursor-pointer"
						/>
					</div>

					<div className="border-t border-slate-100" />

					{/* Note sound section */}
					<div className="flex flex-col gap-1.5">
						<div className="flex justify-between items-center">
							<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
								Note Sound
							</span>
							<span className="text-xs tabular-nums text-slate-400">
								{Math.round(noteGain * 100)}%
							</span>
						</div>
						<input
							type="range"
							min={0}
							max={2}
							step={0.01}
							value={noteGain}
							onChange={(e) => setNoteGain(Number(e.target.value))}
							className="w-full accent-denim cursor-pointer"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
