"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Play, Redo2, Square, Undo2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Stepper } from "@/components/ui/stepper";
import RhythmGrid from "@/components/strum/stage/RhythmGrid";
import { useBarHistory } from "@/components/strum/useBarHistory";
import { useAudioEngine } from "@/components/strum/useAudioEngine";
import { DEFAULT_STRUM_BPM, PRESET_STRUM_PATTERNS, type Beat, type StrumPattern } from "@/lib/strumPatterns";
import { bpmRangeForMeter, clampBpmToMeter, patternBpm, patternMeter, patternNameTakenBy, rescaleBpmForMeter } from "@/lib/strumBars";
import { allowedCellsPerBeat, cellCountLabel, meterLabel, metersEqual, SUPPORTED_METERS, DEFAULT_METER, type Meter } from "@/lib/strumMeter";
import { cycleRhythmCell, patternRhythm, withRhythm } from "@/lib/strumRhythm";
import { barLocalBeatIndex } from "@/lib/strumBarEdit";
import { patternNotation } from "@/lib/strumNotation";
import {
	MAX_PATTERN_BARS,
	emptyRhythmBar,
	parseComposerText,
	removeRhythmBar,
	resizeRhythm,
	rhythmSubdivision,
	rhythmText,
	setRhythmBarCount,
} from "@/lib/strumComposer";
import { useNavRouter } from "@/components/nav-progress";

/** The starting points offered for a new pattern. */
const STARTERS = ["4-4 old faithful", "4-4 on the beats", "4-4 boaf", "muted"]
	.map((id) => PRESET_STRUM_PATTERNS.find((p) => p.id === id))
	.filter((p): p is StrumPattern => p !== undefined);

interface Props {
	/** The pattern being edited; absent for a new one. */
	editing?: StrumPattern;
	/** Every pattern there is, for the unique-name check. */
	existingPatterns: StrumPattern[];
	user: User | null;
	onSave: (pattern: StrumPattern) => void;
	onClose: () => void;
}

const asBars = (rhythm: Beat[][]) => rhythm.map((beats) => ({ beats, chord: null }));

/**
 * Make or change a pattern: type the strokes or click the grid (each follows the
 * other), pick the meter, the subdivision and how many bars it runs, hear it
 * once, name it. Mounted only while open, so its engine lives no longer.
 */
export default function PatternComposer({ editing, existingPatterns, user, onSave, onClose }: Props) {
	const router = useNavRouter();
	const startMeter = editing ? patternMeter(editing) : DEFAULT_METER;
	const startRhythm = editing ? patternRhythm(editing) : [emptyRhythmBar(DEFAULT_METER)];
	const [meter, setMeter] = useState<Meter>(startMeter);
	const [bpm, setBpm] = useState(editing ? patternBpm(editing) : DEFAULT_STRUM_BPM);
	const [name, setName] = useState(editing?.name ?? "");
	const [nameError, setNameError] = useState<string | null>(null);
	const history = useBarHistory(asBars(startRhythm));
	const rhythm = history.bars.map((bar) => bar.beats);
	const [typed, setTyped] = useState(() => rhythmText(startRhythm));
	const [typedError, setTypedError] = useState<string | null>(null);
	const [starter, setStarter] = useState<string | null>(null);
	const [askSignIn, setAskSignIn] = useState(false);
	const [confirmDiscard, setConfirmDiscard] = useState(false);
	const [pristine] = useState(() => JSON.stringify({ name: editing?.name ?? "", bpm, meter: startMeter, rhythm: startRhythm }));
	const dirty = JSON.stringify({ name, bpm, meter, rhythm }) !== pristine;

	const playBars = asBars(rhythm);
	const engine = useAudioEngine(playBars, bpm, "beat", undefined, meter);
	// Once, on open: the engine's setters are new every render, and setting the
	// metronome while playing restarts playback — run on every render, that
	// restarted it forever and nothing was ever heard.
	const engineSetupRef = useRef(engine);
	useEffect(() => {
		engineSetupRef.current.setPlayOnce(true);
		engineSetupRef.current.setMetronomeEnabled(false);
	}, []);

	const subdivision = rhythmSubdivision(rhythm);
	const { min, max } = bpmRangeForMeter(meter);

	/** Commit a rhythm from the grid or a control; the strokes line follows it. */
	function commit(next: Beat[][]) {
		history.setBars(asBars(next));
		setTyped(rhythmText(next));
		setTypedError(null);
		setStarter(null);
	}

	function onTyped(text: string) {
		setTyped(text);
		setStarter(null);
		if (text.trim() === "") {
			setTypedError(null);
			return;
		}
		const parsed = parseComposerText(text, meter, subdivision);
		if (parsed.ok) {
			history.setBars(asBars(parsed.rhythm));
			setTypedError(null);
		} else {
			setTypedError(parsed.message);
		}
	}

	function pickStarter(preset: StrumPattern) {
		const presetMeter = patternMeter(preset);
		const next = patternRhythm(preset);
		setMeter(presetMeter);
		history.setBars(asBars(next));
		setTyped(rhythmText(next));
		setTypedError(null);
		setStarter(preset.id);
	}

	function changeMeter(next: Meter) {
		if (metersEqual(next, meter)) return;
		// The beats are rebuilt for the new count; the tempo is carried so the
		// eighth note keeps its speed.
		setBpm(clampBpmToMeter(rescaleBpmForMeter(bpm, meter, next), next));
		setMeter(next);
		commit(rhythm.map(() => emptyRhythmBar(next)));
	}

	function save(guestAnswered = false) {
		const trimmed = name.trim();
		if (trimmed === "") return setNameError("Give the pattern a name.");
		// Unique, presets included: the assistant finds a pattern by its name.
		const taken = patternNameTakenBy(trimmed, existingPatterns, editing?.id);
		if (taken) return setNameError(`"${taken.name}" is already a pattern — pick another name.`);
		if (!user && !editing && !guestAnswered) return setAskSignIn(true);
		const pattern = withRhythm(
			{
				...(editing ?? {}),
				id: editing?.id ?? crypto.randomUUID(),
				name: trimmed,
				beats: [],
				bpm: clampBpmToMeter(bpm, meter),
				meter,
			},
			rhythm,
		);
		engine.stop();
		onSave(pattern);
		onClose();
	}

	function requestClose() {
		if (dirty && !confirmDiscard) return setConfirmDiscard(true);
		engine.stop();
		onClose();
	}

	return (
		<Dialog open onOpenChange={(next) => (next ? undefined : requestClose())}>
			<DialogContent
				data-m="strum"
				showCloseButton={false}
				className="flex max-h-[88dvh] flex-col gap-0 p-0 sm:max-w-[640px]"
				onKeyDown={(e) => {
					const inField = e.target instanceof HTMLInputElement;
					if ((e.metaKey || e.ctrlKey) && !inField && e.key.toLowerCase() === "z") {
						e.preventDefault();
						if (e.shiftKey) history.redo();
						else history.undo();
					}
				}}
			>
				<div className="flex items-start gap-3 px-6 pt-5 pb-1">
					<div className="flex-1">
						<DialogTitle className="text-[19px] font-bold">{editing ? "Edit pattern" : "New pattern"}</DialogTitle>
						<DialogDescription className="st-lab mt-1.5">
							Type the strokes or click the grid — each follows the other. A pattern can run one bar or several.
						</DialogDescription>
					</div>
					{confirmDiscard ? (
						<span className="flex items-center gap-1.5">
							<span className="st-lab">Discard changes?</span>
							<Button variant="danger" size="xs" onClick={requestClose}>
								Discard
							</Button>
							<Button variant="secondary" size="xs" onClick={() => setConfirmDiscard(false)}>
								Keep
							</Button>
						</span>
					) : (
						<Button variant="icon" size="xs" aria-label="Close" onClick={requestClose}>
							<X aria-hidden />
						</Button>
					)}
				</div>

				<div className="st-contain flex flex-col gap-4 overflow-y-auto px-6 pt-3.5 pb-4">
					{!editing && (
						<div className="st-starters" role="group" aria-label="Start from">
							{STARTERS.map((preset) => (
								<button
									key={preset.id}
									type="button"
									className="st-shape items-start text-left"
									aria-pressed={starter === preset.id}
									onClick={() => pickStarter(preset)}
								>
									<span className="font-semibold capitalize">{preset.name}</span>
									<span className="st-lab whitespace-pre font-mono">{patternNotation(preset.beats)}</span>
								</button>
							))}
						</div>
					)}

					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center gap-3">
							<label className="st-lab flex-1" htmlFor="strum-strokes">
								Strokes
							</label>
							<Segmented
								label="Meter"
								dense
								options={SUPPORTED_METERS.map((m) => ({ value: meterLabel(m), label: meterLabel(m) }))}
								value={meterLabel(meter)}
								onChange={(label) => {
									const next = SUPPORTED_METERS.find((m) => meterLabel(m) === label);
									if (next) changeMeter(next);
								}}
							/>
						</div>
						<Input
							id="strum-strokes"
							className="font-mono text-lg whitespace-pre"
							value={typed}
							onChange={(e) => onTyped(e.target.value)}
							placeholder="D DU UDU | D D U"
							aria-invalid={typedError ? true : undefined}
							aria-describedby="strum-strokes-help"
							spellCheck={false}
							autoComplete="off"
						/>
						<span id="strum-strokes-help" className={typedError ? "st-lab text-bad" : "st-lab"}>
							{typedError ?? "D down, U up, X muted, a space for a cell nobody strikes, | between bars."}
						</span>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<Segmented
							label="Subdivision"
							dense
							options={allowedCellsPerBeat(meter).map((n) => ({ value: String(n), label: cellCountLabel(meter, n) }))}
							value={subdivision === null ? "" : String(subdivision)}
							onChange={(v) => commit(resizeRhythm(rhythm, Number(v)))}
						/>
						<span className="flex items-center gap-2">
							<span className="st-lab">Bars</span>
							<Stepper label="Bars" value={rhythm.length} min={1} max={MAX_PATTERN_BARS} onChange={(n) => commit(setRhythmBarCount(rhythm, n, meter))} />
						</span>
						<span className="flex-1" />
						<Button variant="ghost" size="xs" aria-label="Undo" disabled={!history.canUndo} onClick={history.undo}>
							<Undo2 aria-hidden />
						</Button>
						<Button variant="ghost" size="xs" aria-label="Redo" disabled={!history.canRedo} onClick={history.redo}>
							<Redo2 aria-hidden />
						</Button>
					</div>

					<div className="flex flex-col gap-2">
						{rhythm.map((bar, bi) => (
							<div key={bi} className="st-cbar">
								<span className="st-lab st-num w-11 pt-4">Bar {bi + 1}</span>
								<div className="min-w-0 flex-1">
									<RhythmGrid
										rhythm={[bar]}
										meter={meter}
										position={
											engine.isPlaying && engine.currBar === bi
												? { bar: 0, beat: barLocalBeatIndex(playBars, engine.currBeat), cell: engine.currCell }
												: null
										}
										onToggle={(_b, beat, cell) => commit(cycleRhythmCell(rhythm, bi, beat, cell))}
									/>
								</div>
								{rhythm.length > 1 && (
									<button type="button" className="st-icon" aria-label={`Remove bar ${bi + 1}`} onClick={() => commit(removeRhythmBar(rhythm, bi))}>
										<X aria-hidden />
									</button>
								)}
							</div>
						))}
					</div>

					<label className="flex flex-col gap-1.5">
						<span className="st-lab">Name</span>
						<Input
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								if (nameError) setNameError(null);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									save();
								}
							}}
							placeholder="Name this pattern"
							aria-label="Pattern name"
							aria-invalid={nameError ? true : undefined}
						/>
						{nameError && <span className="st-lab text-bad">{nameError}</span>}
					</label>
					{askSignIn && (
						<p className="st-lab m-0" role="status">
							Sign in to keep your patterns safe across devices — or keep this one in this browser for now.
						</p>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-2.5 px-6 pt-3.5 pb-4.5 shadow-[0_-1px_0_var(--gp-line)]">
					{askSignIn ? (
						<>
							<span className="flex-1" />
							<Button variant="secondary" size="sm" onClick={() => save(true)}>
								Save in this browser
							</Button>
							<Button
								size="sm"
								onClick={() => {
									save(true);
									router.push("/auth?redirect=/strum");
								}}
							>
								Sign in
							</Button>
						</>
					) : (
						<>
							<Button variant="ghost" size="sm" onClick={requestClose}>
								Cancel
							</Button>
							<span className="flex-1" />
							<span className="flex items-center gap-1.5">
								<Button variant="icon" size="xs" aria-label="Slower" disabled={bpm <= min} onClick={() => setBpm(clampBpmToMeter(bpm - 1, meter))}>
									−
								</Button>
								<span className="st-num min-w-16 text-center font-bold">♩ {bpm}</span>
								<Button variant="icon" size="xs" aria-label="Faster" disabled={bpm >= max} onClick={() => setBpm(clampBpmToMeter(bpm + 1, meter))}>
									+
								</Button>
							</span>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => (engine.isPlaying ? engine.stop() : engine.start())}
								disabled={rhythm.flat(2).every((cell) => cell === "")}
							>
								{engine.isPlaying ? <Square aria-hidden /> : <Play aria-hidden />}
								{engine.isPlaying ? "Stop" : "Hear it once"}
							</Button>
							<Button size="sm" onClick={() => save()}>
								{editing ? "Save changes" : "Create"}
							</Button>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
