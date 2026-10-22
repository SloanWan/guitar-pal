"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CirclePlay, CircleStop, Loader2 } from "lucide-react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { SUPPORTED_METERS, beatUnitGlyph, meterLabel, type Meter } from "@/lib/strumMeter";
import { clampBpmToMeter } from "@/lib/strumBars";
import { byEarWarning, textTabCandidates, type TextTabCandidate } from "@/lib/textTab";
import { stashHandoff } from "@/lib/assistant/handoff";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import { WarningsFold } from "@/components/books/IssueList";
import { DenimButton, GhostButton, MONO_META } from "@/components/books/bookUi";

/**
 * A text tab, read by ear (#228). Six lines of tab carry every fret and the
 * order of the notes, and no durations at all — so instead of guessing one
 * rhythm and calling it read, this offers each reading the columns allow,
 * plays any of them, and takes the one the player says sounds right to the
 * fingerpick page through the ordinary handoff, marked as chosen by ear.
 *
 * Self-contained: it owns its audio engine (opened on mount, closed on
 * unmount, like the draft panel beside a book) and the text it reads. The
 * host — a dialog on the fingerpick page, a panel beside a book — gives it
 * the text to start from and learns when a candidate has left.
 */

const FINGERPICK_PATH = "/fingerpick";
const DEFAULT_BPM = 90;

export default function TextTabPicker({
	initialText = "",
	initialName,
	navigate = false,
	onTaken,
	readOnlyText = false,
}: {
	initialText?: string;
	/** What the chosen pattern is called: "Page 12 of …" beside a book, the default otherwise. */
	initialName?: string;
	/** Go to the fingerpick page after the handoff; false where the page is already there. */
	navigate?: boolean;
	/** The chosen candidate has been handed over. */
	onTaken?: () => void;
	/** The text came from a book page: shown as read, not edited. */
	readOnlyText?: boolean;
}) {
	const router = useRouter();
	const [text, setText] = useState(initialText);
	const [meter, setMeter] = useState<Meter>([4, 4]);
	const [bpm, setBpm] = useState(DEFAULT_BPM);
	const [name, setName] = useState(initialName ?? "");
	const [chosen, setChosen] = useState<TextTabCandidate["id"] | null>(null);
	const [opening, setOpening] = useState(false);

	const read = useMemo(() => textTabCandidates(text, { timeSignature: meter, bpm, name }), [text, meter, bpm, name]);
	const candidates = read.ok ? read.candidates : [];
	// The chosen reading, or the first once there is one — and the first
	// again if an edit to the text took the chosen one away.
	const candidate = candidates.find((c) => c.id === chosen) ?? candidates[0] ?? null;

	const { isLoaded, isPlaying, load, play, stop } = useFingerpickAudioEngine();
	// Samples on mount: the host opened on a click, so the context may open now.
	useEffect(() => {
		void load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	// Which candidate was last played; it is sounding only while the engine says so.
	const [lastPlayed, setLastPlayed] = useState<TextTabCandidate["id"] | null>(null);
	const playingId = isPlaying ? lastPlayed : null;
	// An edit to the text or the meter changes what every candidate is; what
	// was sounding is no longer one of them.
	function changeText(next: string) {
		stop();
		setText(next);
	}
	function changeMeter(next: Meter) {
		stop();
		setMeter(next);
	}

	function listen(c: TextTabCandidate) {
		setChosen(c.id);
		if (playingId === c.id) {
			stop();
			return;
		}
		play({ ...c.pattern, bpm: clampBpmToMeter(bpm, meter) }, { loop: true, forceLetRing: true });
		setLastPlayed(c.id);
	}

	function take() {
		if (!candidate || opening) return;
		setOpening(true);
		stop();
		const pattern: FingerpickPattern = { ...candidate.pattern, id: crypto.randomUUID() };
		stashHandoff({ kind: "fingerpick", pattern, warnings: [byEarWarning(candidate), ...candidate.warnings] });
		onTaken?.();
		if (navigate) router.push(FINGERPICK_PATH);
		else setOpening(false);
	}

	// The staves are packed to the preview's real width, known once it is on screen.
	const [viewerEl, setViewerEl] = useState<HTMLDivElement | null>(null);
	const [containerWidth, setContainerWidth] = useState(0);
	useEffect(() => {
		if (!viewerEl) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setContainerWidth(Math.floor(entry.contentRect.width));
		});
		observer.observe(viewerEl);
		return () => observer.disconnect();
	}, [viewerEl]);
	const rows = useMemo(
		() => (candidate ? layoutMeasureRows(candidate.pattern.measures, containerWidth, 0) : []),
		[candidate, containerWidth],
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col" data-testid="text-tab-picker">
			<div className="flex flex-none flex-col gap-3 border-b border-line px-4 py-3">
				<textarea
					value={text}
					onChange={(e) => changeText(e.target.value)}
					readOnly={readOnlyText}
					spellCheck={false}
					rows={7}
					placeholder={"e|--0--3--|\nB|--1-----|\nG|--0-----|\nD|--2-----|\nA|--3-----|\nE|--------|"}
					aria-label="Text tab"
					className="w-full resize-y border border-line-strong bg-surface px-3 py-2 font-mono text-[12px] leading-[1.35] text-ink whitespace-pre placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent read-only:text-ink-dim"
				/>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<label className={`${MONO_META} flex items-center gap-2`}>
						Meter
						<select
							value={meterLabel(meter)}
							onChange={(e) => {
								const next = SUPPORTED_METERS.find((m) => meterLabel(m) === e.target.value);
								if (next) changeMeter([next[0], next[1]]);
							}}
							className="h-7 border border-line-strong bg-surface px-2 font-mono text-[11px] text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
						>
							{SUPPORTED_METERS.map((m) => (
								<option key={meterLabel(m)} value={meterLabel(m)}>
									{meterLabel(m)}
								</option>
							))}
						</select>
					</label>
					<label className={`${MONO_META} flex items-center gap-2`}>
						{beatUnitGlyph(meter)} =
						<input
							type="number"
							min={30}
							max={300}
							value={bpm}
							onChange={(e) => setBpm(Number(e.target.value) || DEFAULT_BPM)}
							aria-label="Tempo"
							className="h-7 w-16 border border-line-strong bg-surface px-2 font-mono text-[11px] text-ink tabular-nums focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
						/>
					</label>
					<label className={`${MONO_META} flex min-w-0 flex-1 items-center gap-2`}>
						Name
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Text tab"
							aria-label="Pattern name"
							className="h-7 min-w-0 flex-1 border border-line-strong bg-surface px-2 font-mono text-[11px] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
						/>
					</label>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{!read.ok ? (
					<p className="px-4 py-6 text-[13px] text-ink-dim">
						{text.trim() === "" ? "Paste six lines of tab, one per string." : read.error}
					</p>
				) : (
					<>
						<ul className="flex flex-col border-b border-line" role="radiogroup" aria-label="Readings">
							{candidates.map((c) => {
								const selected = candidate?.id === c.id;
								const sounding = playingId === c.id;
								return (
									<li
										key={c.id}
										className={`flex items-center gap-3 border-l-2 px-4 py-2.5 transition-colors duration-(--dur-hover) ${
											selected ? "border-l-denim bg-denim-tint" : "border-l-transparent hover:bg-sidebar-hover"
										}`}
									>
										<button
											type="button"
											onClick={() => (isLoaded ? listen(c) : undefined)}
											disabled={!isLoaded}
											aria-label={!isLoaded ? "Loading samples" : sounding ? `Stop ${c.label}` : `Play ${c.label}`}
											className="flex size-9 flex-none items-center justify-center border border-denim bg-denim text-on-denim transition-colors hover:bg-denim-accent disabled:pointer-events-none disabled:opacity-30"
										>
											{!isLoaded ? (
												<Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
											) : sounding ? (
												<CircleStop size={16} strokeWidth={1.5} />
											) : (
												<CirclePlay size={16} strokeWidth={1.5} />
											)}
										</button>
										<button
											type="button"
											role="radio"
											aria-checked={selected}
											onClick={() => setChosen(c.id)}
											className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
										>
											<span className={`text-[13px] font-medium ${selected ? "text-denim-accent" : "text-ink"}`}>
												{c.label}
												<span className={`${MONO_META} ml-2 tabular-nums`}>
													{c.pattern.measures.length} {c.pattern.measures.length === 1 ? "bar" : "bars"}
												</span>
											</span>
											<span className="text-[12px] text-ink-dim">{c.description}</span>
										</button>
										<WarningsFold issues={c.warnings} className="flex-none" />
									</li>
								);
							})}
						</ul>
						{candidate ? (
							<div ref={setViewerEl} data-tab-viewer className="px-4 py-3">
								{rows.map((row) => (
									<TabStaveRow
										key={row.measures[0].id}
										measures={row.measures}
										timeSignature={candidate.pattern.timeSignature}
										startMeasureNumber={row.startMeasureNumber}
										startMeasureIndex={row.startMeasureNumber - 1}
										measureWidths={row.widths}
									/>
								))}
							</div>
						) : null}
					</>
				)}
			</div>

			<footer className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
				<p className={MONO_META}>
					{candidate ? `${candidate.label} · ${meterLabel(meter)} · ${beatUnitGlyph(meter)} = ${bpm}` : "Nothing to open yet"}
				</p>
				<span className="flex items-center gap-2">
					{playingId ? (
						<GhostButton onClick={() => stop()}>
							<CircleStop className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
							Stop
						</GhostButton>
					) : null}
					<DenimButton onClick={take} disabled={!candidate || opening} title="Take this reading to the fingerpick editor">
						Open in fingerpick
						<ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
					</DenimButton>
				</span>
			</footer>
		</div>
	);
}
