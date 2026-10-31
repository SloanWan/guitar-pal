"use client";

import { useEffect, useMemo, useState } from "react";
import "./textTab.css";
import { ArrowUpRight, Play, Square } from "lucide-react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { SUPPORTED_METERS, beatUnitGlyph, meterLabel, type Meter } from "@/lib/strumMeter";
import { clampBpmToMeter } from "@/lib/strumBars";
import { byEarWarning, textTabCandidates, type TextTabCandidate } from "@/lib/textTab";
import { stashHandoff } from "@/lib/assistant/handoff";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import { WarningsFold } from "@/components/books/IssueList";
import { Button } from "@/components/ui/button";
import { useNavRouter } from "@/components/nav-progress";

/**
 * A text tab, read by ear (#228). Six lines of tab carry every fret and the
 * order of the notes, and no durations at all — so instead of guessing one
 * rhythm and calling it read, this offers each reading the columns allow,
 * plays any of them, and takes the one the player says sounds right to the
 * Tab page through the ordinary handoff, marked as chosen by ear.
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
	const router = useNavRouter();
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
		<div className="tt" data-testid="text-tab-picker">
			<div className="tt-top">
				<textarea
					value={text}
					onChange={(e) => changeText(e.target.value)}
					readOnly={readOnlyText}
					spellCheck={false}
					rows={7}
					placeholder={"e|--0--3--|\nB|--1-----|\nG|--0-----|\nD|--2-----|\nA|--3-----|\nE|--------|"}
					aria-label="Text tab"
					className="tt-text"
				/>
				<div className="tt-fields">
					<label className="tt-field">
						Meter
						<select
							value={meterLabel(meter)}
							onChange={(e) => {
								const next = SUPPORTED_METERS.find((m) => meterLabel(m) === e.target.value);
								if (next) changeMeter([next[0], next[1]]);
							}}
							className="tt-input"
						>
							{SUPPORTED_METERS.map((m) => (
								<option key={meterLabel(m)} value={meterLabel(m)}>
									{meterLabel(m)}
								</option>
							))}
						</select>
					</label>
					<label className="tt-field">
						{beatUnitGlyph(meter)} =
						<input
							type="number"
							min={30}
							max={300}
							value={bpm}
							onChange={(e) => setBpm(Number(e.target.value) || DEFAULT_BPM)}
							aria-label="Tempo"
							className="tt-input tt-num"
						/>
					</label>
					<label className="tt-field tt-grow">
						Name
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Text tab"
							aria-label="Pattern name"
							className="tt-input tt-grow"
						/>
					</label>
				</div>
			</div>

			<div className="tt-body">
				{!read.ok ? (
					<p className="tt-empty">{text.trim() === "" ? "Paste six lines of tab, one per string." : read.error}</p>
				) : (
					<>
						<ul className="tt-readings" role="radiogroup" aria-label="Readings">
							{candidates.map((c) => {
								const selected = candidate?.id === c.id;
								const sounding = playingId === c.id;
								return (
									<li key={c.id} className="tt-reading" aria-current={selected ? "true" : undefined}>
										<Button
											variant="icon"
											size="sm"
											onClick={() => (isLoaded ? listen(c) : undefined)}
											disabled={!isLoaded}
											aria-label={!isLoaded ? "Loading samples" : sounding ? `Stop ${c.label}` : `Play ${c.label}`}
										>
											{sounding ? <Square fill="currentColor" aria-hidden /> : <Play aria-hidden />}
										</Button>
										<button
											type="button"
											role="radio"
											aria-checked={selected}
											onClick={() => setChosen(c.id)}
											className="tt-pick"
										>
											<b>
												{c.label}
												<span className="tt-meta">
													{c.pattern.measures.length} {c.pattern.measures.length === 1 ? "bar" : "bars"}
												</span>
											</b>
											<span>{c.description}</span>
										</button>
										<WarningsFold issues={c.warnings} />
									</li>
								);
							})}
						</ul>
						{candidate ? (
							<div ref={setViewerEl} data-tab-viewer className="tt-staves">
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

			<footer className="tt-foot">
				<p className="tt-meta">
					{candidate ? `${candidate.label} · ${meterLabel(meter)} · ${beatUnitGlyph(meter)} = ${bpm}` : "Nothing to open yet"}
				</p>
				<span className="tt-acts">
					{playingId ? (
						<Button variant="secondary" size="sm" onClick={() => stop()}>
							<Square fill="currentColor" aria-hidden />
							Stop
						</Button>
					) : null}
					<Button size="sm" onClick={take} disabled={!candidate} loading={opening} title="Take this reading to the Tab page">
						Open in Tab
						<ArrowUpRight aria-hidden />
					</Button>
				</span>
			</footer>
		</div>
	);
}
