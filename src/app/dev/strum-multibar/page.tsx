"use client";

// Dev harness for issue #134: drives useAudioEngine with a hardcoded multi-bar
// pattern so per-bar chord switching can be verified by ear before the
// multi-bar editing UI exists (issue #135). Not linked from anywhere in the app.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Bar, ChordRef, TickMode } from "@/lib/strumPatterns";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { resolveBarChords } from "@/lib/strumBars";
import { barLocalBeatIndex, setBarChord } from "@/lib/strumBarEdit";
import { useAudioEngine, type BarPitches } from "@/components/strum/useAudioEngine";
import StepGridCard from "@/components/strum/StepGridCard";
import type { ConfirmedChord } from "@/components/strum/ChordPickerModal";

const OLD_FAITHFUL: Bar["beats"] = [
	["D", "UG"],
	["D", "U"],
	["DG", "U"],
	["D", "UG"],
];

const PROGRESSIONS: Record<string, Bar[]> = {
	"C–G–Am–F (4 bars)": [
		{ beats: OLD_FAITHFUL, chord: { root: "C", suffix: "major" } },
		{ beats: OLD_FAITHFUL, chord: { root: "G", suffix: "major" } },
		{ beats: OLD_FAITHFUL, chord: { root: "A", suffix: "minor" } },
		{ beats: OLD_FAITHFUL, chord: { root: "F", suffix: "major" } },
	],
	"C only (1 bar — regression check)": [
		{ beats: OLD_FAITHFUL, chord: { root: "C", suffix: "major" } },
	],
	"Uneven bars (4 + 3 beats)": [
		{ beats: OLD_FAITHFUL, chord: { root: "C", suffix: "major" } },
		{ beats: OLD_FAITHFUL.slice(0, 3), chord: { root: "G", suffix: "major" } },
	],
};

async function lookupVoicings(ref: ChordRef): Promise<ChordVoicing[] | null> {
	const supabase = createClient();
	const { data } = await supabase
		.from("chords")
		.select("chord_voicings(id, label, start_fret, barre_fret, capo, frets, fingers)")
		.eq("root", ref.root)
		.eq("suffix", ref.suffix)
		.single();
	return (data as { chord_voicings: ChordVoicing[] } | null)?.chord_voicings ?? null;
}

export default function StrumMultibarDevPage() {
	const [progression, setProgression] = useState<keyof typeof PROGRESSIONS>(
		"C–G–Am–F (4 bars)",
	);
	const [bpm, setBpm] = useState(60);
	const [tickMode] = useState<TickMode>("quarter");
	const [barPitches, setBarPitches] = useState<BarPitches>([]);

	const initialBars = useMemo(() => PROGRESSIONS[progression], [progression]);
	const [bars, setBars] = useState<Bar[]>(initialBars);

	useEffect(() => {
		queueMicrotask(() => setBars(initialBars));
	}, [initialBars]);

	useEffect(() => {
		let cancelled = false;
		resolveBarChords(bars, lookupVoicings)
			.then((pitches) => {
				if (!cancelled) setBarPitches(pitches);
			})
			.catch((err: unknown) => {
				console.error("[strum-multibar] chord resolution failed:", err);
			});
		return () => {
			cancelled = true;
		};
	}, [bars]);

	const { isPlaying, start, stop, currBar, currBeat, currCell, accentEnabled, setAccentEnabled } =
		useAudioEngine(bars, bpm, tickMode, barPitches);

	function handleBarChordChange(barIdx: number, chord: ConfirmedChord | null) {
		setBars((prev) =>
			setBarChord(
				prev,
				barIdx,
				chord
					? { root: chord.root, suffix: chord.suffix, voicingId: chord.voicingId ?? null }
					: null,
			),
		);
		setBarPitches((prev) =>
			prev.map((pitches, i) => (i === barIdx ? (chord?.pitches ?? null) : pitches)),
		);
	}

	return (
		<main className="mx-auto flex max-w-2xl flex-col gap-6 p-8 font-mono text-sm">
			<h1 className="text-lg font-semibold">strum multi-bar harness (#134)</h1>

			<label className="flex flex-col gap-1">
				<span className="text-denim">progression</span>
				<select
					className="border border-denim-border p-2"
					value={progression}
					onChange={(e) => {
						stop();
						setProgression(e.target.value as keyof typeof PROGRESSIONS);
					}}
				>
					{Object.keys(PROGRESSIONS).map((name) => (
						<option key={name} value={name}>
							{name}
						</option>
					))}
				</select>
			</label>

			<label className="flex flex-col gap-1">
				<span className="text-denim">bpm — {bpm}</span>
				<input
					type="range"
					min={40}
					max={220}
					value={bpm}
					onChange={(e) => setBpm(Number(e.target.value))}
				/>
			</label>

			<label className="flex items-center gap-2">
				<input
					type="checkbox"
					checked={accentEnabled}
					onChange={(e) => setAccentEnabled(e.target.checked)}
				/>
				<span>accent (should fire on every bar head)</span>
			</label>

			<button
				className="border border-denim-border bg-denim-tint p-2 text-denim"
				onClick={() => (isPlaying ? stop() : start())}
			>
				{isPlaying ? "stop" : "play"}
			</button>

			<StepGridCard
				pattern={{ id: "dev", name: progression, description: "dev harness", beats: [] }}
				bars={bars}
				activeCell={{
					barIdx: currBar,
					beatIdx: barLocalBeatIndex(bars, currBeat),
					cellIdx: currCell,
				}}
				onBarChordChange={handleBarChordChange}
			/>

			<pre className="border border-denim-border p-3 text-xs">
				{JSON.stringify(
					{
						cursor: { bar: currBar, beat: currBeat, cell: currCell },
						bars: bars.map((b, i) => ({
							chord: b.chord ? `${b.chord.root}${b.chord.suffix}` : null,
							beats: b.beats.length,
							pitches: barPitches?.[i] ?? "resolving…",
						})),
					},
					null,
					2,
				)}
			</pre>
		</main>
	);
}
