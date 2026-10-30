"use client";

import { useEffect, useRef, useState } from "react";
import { PlayPick } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { registerTap } from "@/lib/landing/eggs";
import { SONG, SONG_BAR_SHAPES, SONG_SHAPES } from "@/lib/landing/song";
import { useSongPlayer, type SongMode } from "./SongPlayer";

/** How long the dropped pick's line stays up. */
const PICK_DROP_SHOWN_MS = 2600;

const MODES: readonly { value: SongMode; label: string }[] = [
	{ value: "strum", label: "Strum" },
	{ value: "pick", label: "Pick" },
];

/** The song's source, credited wherever the song is shown. */
export function SongSource({ className = "" }: { className?: string }) {
	return (
		<a
			href={SONG.source.url}
			target="_blank"
			rel="noopener noreferrer"
			className={`gp-focus rounded-gp-xs text-(length:--gp-t-cap) text-gp-ink-3 underline decoration-gp-edge underline-offset-4 transition-colors duration-(--gp-d-state) hover:text-gp-ink ${className}`}
		>
			Chords after {SONG.source.label} · YouTube
		</a>
	);
}

/** "Capo 2", as the strum and tab pages show it. */
export function CapoTag() {
	return (
		<span className="inline-flex h-6 items-center rounded-gp-pill bg-gp-well px-2.5 text-(length:--gp-t-cap) font-semibold text-gp-ink-2">
			Capo {SONG.capo}
		</span>
	);
}

/**
 * The hero's song: what it is, where its chords come from, its eight bars as
 * the shapes the player holds (the sounding chord under each), and the one
 * player the whole page follows — strummed or picked.
 */
export default function SongCard() {
	const { mode, setMode, playing, preparing, toggle, bar } = useSongPlayer();

	// Easter egg: press Play seven times in a row and the pick flies off and comes back.
	const tapsRef = useRef<number[]>([]);
	const [dropped, setDropped] = useState(false);
	useEffect(() => {
		if (!dropped) return;
		const id = window.setTimeout(() => setDropped(false), PICK_DROP_SHOWN_MS);
		return () => clearTimeout(id);
	}, [dropped]);
	function press() {
		const tap = registerTap(tapsRef.current, performance.now());
		tapsRef.current = tap.taps;
		if (tap.dropped) setDropped(true);
		toggle();
	}

	return (
		// The card wears the module of whatever is playing it: Strum's green, or Tab's blue when picked.
		<div data-m={mode === "pick" ? "tab" : "strum"} className="rounded-gp-xl bg-gp-card p-5 max-sm:p-4">
			<p className="text-(length:--gp-t-cap) text-gp-ink-3">
				{SONG.artist} · {SONG.year} · {SONG.meter[0]}/{SONG.meter[1]} · ♩ = {SONG.bpm} · sounds in D major
			</p>
			<h2 className="mt-1 font-gp-display text-(length:--gp-t-l) leading-(--gp-lh-head) font-bold text-gp-ink">
				{SONG.title}
			</h2>
			<SongSource className="mt-1 inline-block" />

			<div className="mt-4 flex flex-wrap items-center gap-2.5">
				<CapoTag />
				<span className="text-(length:--gp-t-cap) text-gp-ink-3">Shapes as you hold them, the sounding chord under each</span>
			</div>

			<ol className="mt-3 grid grid-cols-4 gap-2" aria-label="Bars">
				{SONG_BAR_SHAPES.map((i, b) => {
					const shape = SONG_SHAPES[i];
					const now = bar === b;
					return (
						<li
							key={b}
							aria-current={now ? "true" : undefined}
							className={`flex h-14 flex-col items-center justify-center rounded-gp-md transition-[background-color,color,opacity,box-shadow] duration-(--gp-d-state) ${
								now
									? "bg-gp-m-100 text-gp-m-700 shadow-[inset_0_0_0_1.5px_var(--gp-m-500)]"
									: "bg-gp-well text-gp-ink"
							}`}
						>
							<span className="font-gp-display text-[17px] leading-none font-bold">{shape.name}</span>
							<span className={`mt-1 text-[11.5px] leading-none ${now ? "" : "text-gp-ink-3"}`}>sounds {shape.sounds}</span>
						</li>
					);
				})}
			</ol>

			<div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
				<span className={`inline-flex ${dropped ? "ld-pick-drop" : ""}`}>
					<PlayPick
						playing={playing}
						onClick={press}
						aria-label={playing ? "Stop the song" : "Play the song"}
						aria-busy={preparing || undefined}
					/>
				</span>
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-gp-ink">{playing ? (preparing ? "Tuning up…" : "Playing") : "Play the song"}</p>
					<p className="text-(length:--gp-t-cap) text-gp-ink-3" aria-live="polite">
						{dropped
							? "Dropped my pick. Happens to everyone."
							: mode === "strum"
								? "Eight bars, strummed · loops"
								: "Eight bars, picked · loops"}
					</p>
				</div>
				<Segmented dense label="Play as" options={MODES} value={mode} onChange={setMode} />
			</div>
		</div>
	);
}
