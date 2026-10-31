"use client";

import "@/components/strum/strum.css";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { ArrowDownUp, ArrowRight } from "lucide-react";
import Link from "@/components/AppLink";
import RhythmGrid from "@/components/strum/stage/RhythmGrid";
import { useStrumPlayback } from "@/components/strum/useStrumPlayback";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { Button, PlayPick } from "@/components/ui/button";
import { ModuleBadge } from "@/components/ui/list-row";
import { useUser } from "@/hooks/useUser";
import { transposeChord } from "@/lib/chordBoard";
import { withGlyphs } from "@/lib/chordFormulas";
import { chordSymbol } from "@/lib/chordSuffixes";
import { loadVoicings } from "@/lib/chordVoicingCache";
import type { HomeContinue } from "@/lib/home/loadHome";
import { whenLabel } from "@/lib/home/home";
import { SONG, SONG_PROGRESSION, SONG_STRUM_PATTERN_ID } from "@/lib/landing/song";
import { clampBpmToMeter, normalizeBpm, patternBpm, patternMeter } from "@/lib/strumBars";
import { PRESET_STRUM_PATTERNS, type Bar } from "@/lib/strumPatterns";
import { barLabel, progressionCapo, progressionDisplayName } from "@/lib/strumProgressions";
import { patternRhythm } from "@/lib/strumRhythm";
import { withUserVoicings } from "@/lib/userChordVoicings";

// Nothing strummed yet: the landing's song, on its preset, is where to start.
const STARTER: HomeContinue = {
	pattern: PRESET_STRUM_PATTERNS.find((p) => p.id === SONG_STRUM_PATTERN_ID) ?? PRESET_STRUM_PATTERNS[0],
	progression: SONG_PROGRESSION,
	openedAt: null,
};

/** What a bar's shape sounds as behind the capo: "Bm7" for Am7 on 2. */
function sounding(bar: Bar, capo: number): string | null {
	if (capo === 0 || !bar.chord) return null;
	const moved = transposeChord(bar.chord.root, bar.chord.suffix, capo);
	return moved ? withGlyphs(chordSymbol(moved.root, moved.suffix)) : null;
}

interface Props {
	/** The pattern last opened on Strum, or null for one never opened. */
	continued: HomeContinue | null;
	now: Date | null;
}

/**
 * The song last strummed, ready to play: its chords a tile a bar (what they sound
 * as under a capo), its rhythm as Strum draws it, and Play — the Strum page's own
 * engine, fed what Strum would open.
 */
export default function ContinueCard({ continued, now }: Props) {
	const { pattern, progression, openedAt } = continued ?? STARTER;
	const starter = continued === null;

	const { user, loading } = useUser();
	const { voicings } = useUserChordVoicings(user, loading);
	const lookupVoicings = useMemo(() => withUserVoicings(loadVoicings, voicings), [voicings]);
	const voicingsKey = useMemo(() => voicings.map((v) => `${v.id}:${v.start_fret}:${v.frets}`).join("|"), [voicings]);

	const rhythm = useMemo(() => patternRhythm(pattern), [pattern]);
	const meter = patternMeter(pattern);
	const bpm = clampBpmToMeter(progression?.bpm !== undefined ? normalizeBpm(progression.bpm) : patternBpm(pattern), meter);
	const capo = progressionCapo(progression);
	const playback = useStrumPlayback({ rhythm, progression, meter, bpm, lookupVoicings, voicingsKey });
	const { isPlaying, isPreparing, chordBar, rhythmPosition, start, stop } = playback;
	const playing = isPlaying || isPreparing;

	// Nothing keeps sounding after the page goes.
	const stopRef = useRef(stop);
	useEffect(() => {
		stopRef.current = stop;
	});
	useEffect(() => () => stopRef.current(), []);

	const bars = progression?.bars ?? [];
	const title = starter ? SONG.title : progression ? progressionDisplayName(progression) : pattern.name;
	const meta = [
		starter ? SONG.artist : progression ? `on ${pattern.name}` : "Rhythm only",
		capo > 0 ? `Capo ${capo}` : null,
		`${bpm} BPM`,
	]
		.filter(Boolean)
		.join(" · ");
	const status = isPreparing
		? "Tuning up…"
		: isPlaying
			? bars.length > 0 && chordBar !== null
				? `Bar ${chordBar + 1} of ${bars.length}`
				: "Playing"
			: starter
				? "A song to start on"
				: openedAt && now
					? `Opened ${whenLabel(new Date(openedAt), now)}`
					: "Last opened on Strum";

	return (
		<article className="hm-cont" data-m="strum" aria-label={`${starter ? "Start with" : "Continue"}: ${title}`}>
			<div className="hm-cont-top">
				<span className="hm-modline">
					<ModuleBadge icon={ArrowDownUp} />
					{starter ? "Strum · Start here" : `Strum · ${progression ? "Progression" : "Pattern"}`}
				</span>
				<span className="hm-cont-name">{title}</span>
				<span className="hm-meta">
					{meta}
					{starter && (
						<>
							{" · "}
							<a href={SONG.source.url} target="_blank" rel="noopener noreferrer" className="gp-focus">
								Chords after {SONG.source.label}
							</a>
						</>
					)}
				</span>
			</div>

			{bars.length > 0 && (
				<ol className="hm-bars" aria-label="Chords, one per bar" style={{ "--n": String(bars.length) } as CSSProperties}>
					{bars.map((bar, b) => {
						const sounds = sounding(bar, capo);
						return (
							<li key={b} className="hm-bar" aria-current={isPlaying && chordBar === b ? "true" : undefined}>
								<span>{withGlyphs(barLabel(bar))}</span>
								{sounds && <small>sounds {sounds}</small>}
							</li>
						);
					})}
				</ol>
			)}

			{/* the grid zone carries the cell sizes RhythmGrid measures with */}
			<div className="st-contain" data-m="strum">
				<div className="st-gridzone">
					<RhythmGrid rhythm={rhythm} meter={meter} position={rhythmPosition} />
				</div>
			</div>

			<div className="hm-ctl">
				<PlayPick
					playing={playing}
					onClick={() => (playing ? stop() : start())}
					aria-label={playing ? `Stop ${title}` : `Play ${title}`}
					aria-busy={isPreparing || undefined}
				/>
				<p className="hm-status" aria-live="polite">
					<b>{status}</b>
					<span className="hm-meta">{bars.length > 0 ? `${bars.length} bars · loops` : "Loops the rhythm"}</span>
				</p>
				<Button asChild variant="secondary">
					<Link href={`/strum?pattern=${encodeURIComponent(pattern.id)}`}>
						Open in Strum <ArrowRight aria-hidden />
					</Link>
				</Button>
			</div>
		</article>
	);
}
