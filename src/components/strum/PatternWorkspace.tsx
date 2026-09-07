"use client";

import { useEffect, useId, useState } from "react";
import { Guitar, List, Music, Pencil, Plus, Trash2, Type, X } from "lucide-react";
import type { Bar, ChordProgression, StrumPattern } from "@/lib/strumPatterns";
import {
	progressionDisplayName,
	progressionCapo,
	chordAbbreviation,
	parseChordSequence,
	keptTokens,
	hasShapeToken,
	type ChordToken,
	type UnknownChordChoice,
} from "@/lib/strumProgressions";
import { useChordShapeCorpus } from "@/components/chords/useChordShapeMatches";
import { useChordSearchNavigation } from "@/components/chords/useChordSearchNavigation";
import { resolveShapeToChord } from "@/lib/chordShapeSearch";
import {
	PROGRESSION_PRESETS,
	filterPresets,
	groupPresets,
	type ProgressionPreset,
} from "@/lib/strumProgressionPresets";
import { barPlaceholder, patternMeter } from "@/lib/strumBars";
import { getChordIndex } from "@/lib/chords";
import { peekVoicings } from "@/lib/chordVoicingCache";
import { selectRefVoicing } from "@/lib/strumBars";
import {
	chordIndexWithUser,
	mergeVoicings,
	type UserChordVoicing,
} from "@/lib/userChordVoicings";
import ChordShapeModal, { type ApplyScope } from "@/components/chords/ChordShapeModal";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import StepGrid, { type ActiveCell, type ChordView } from "./StepGrid";
import { useBarChordDiagrams } from "./useBarChordDiagrams";
import StepGridCard from "./StepGridCard";
import ChordViewToggle from "./ChordViewToggle";
import PatternBarBody from "./PatternBarBody";
import ChordPickerModal, { type ConfirmedChord } from "./ChordPickerModal";

/** Which view of the selected pattern is on screen. */
export type WorkspaceTab = "pattern" | "progressions";

interface Props {
	pattern: StrumPattern;
	/** The bars actually playing: the pattern's bar, or the open progression's. */
	bars: Bar[];
	activeCell: ActiveCell | null;
	tab: WorkspaceTab;
	onTabChange: (tab: WorkspaceTab) => void;
	/** Session-only chord picking, offered on the pattern tab alone. */
	onBarChordChange: (barIdx: number, chord: ConfirmedChord | null) => void;
	/** This pattern's progressions, already in playing order. */
	progressions: ChordProgression[];
	progressionsLoading: boolean;
	selectedProgressionId: string | null;
	onSelectProgression: (id: string | null) => void;
	/**
	 * Create a progression from a typed chord sequence, one bar per word. Words
	 * the library could not match arrive only when the player chose to keep them;
	 * those bars carry the name and no chord.
	 */
	onAddProgression: (tokens: ChordToken[]) => void;
	onEditProgression: (progression: ChordProgression) => void;
	onDeleteProgression: (progression: ChordProgression) => void;
	/**
	 * Name the chord of a bar in the open sequence, saved with it. Given only
	 * where there is a sequence to save into; used to finish a bar kept as a name
	 * the chord library has nothing for, from where the sequence is read.
	 */
	onProgressionBarChord?: (barIdx: number, chord: ConfirmedChord | null) => void;
	/** Given only for a pattern the user owns; presets cannot be edited. */
	onEditPattern?: () => void;
	/**
	 * Whether the open sequence is still in step with the pattern it was written
	 * over. "ask" means the pattern's rhythm has moved and the player has not
	 * answered; "detached" means they said no and it no longer follows.
	 */
	patternSync?: "ask" | "detached" | null;
	onApplyPatternSync?: () => void;
	onDeclinePatternSync?: () => void;
	onResumePatternSync?: () => void;
	onDismissPatternNotice?: () => void;
	/**
	 * Pin a shape the player wrote onto this bar, or onto every bar playing the
	 * same chord. Given only where the bars can actually be saved.
	 */
	onApplyChordShape?: (barIdx: number, voicing: UserChordVoicing, scope: ApplyScope) => void;
	/** The player's own shapes, held by the page so sound and picture agree. */
	userVoicings?: readonly UserChordVoicing[];
	/** Returns the row the shape actually lives in — its id may not be the one just minted. */
	onSaveVoicing?: (voicing: UserChordVoicing) => UserChordVoicing;
}

/**
 * The three answers to "this word is not a chord we have". Ordered as the
 * keyboard walks them, and keeping is first because it is the one that throws
 * nothing the player typed away.
 */
const UNKNOWN_ANSWERS = [
	{
		key: "keep",
		label: "Keep as written",
		hint: "Write them down as typed — those bars sound nothing until you give them a shape",
	},
	{ key: "skip", label: "Skip them", hint: "Leave them out of the progression" },
	{ key: "edit", label: "Keep editing", hint: "Go back to the line and change it" },
] as const;

type UnknownAnswer = (typeof UNKNOWN_ANSWERS)[number]["key"] | "create";

/** Written both ways: the same chord chart is copied on both kinds of keyboard. */
const WRITE_SHORTCUT = "Ctrl/⌘ + Enter";

interface UnknownOption {
	key: UnknownAnswer;
	label: string;
	hint: string;
}

function TabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`border-b-2 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors ${
				active
					? "border-denim text-denim"
					: "border-transparent text-ink-dim hover:text-ink"
			}`}
		>
			{children}
		</button>
	);
}

export default function PatternWorkspace({
	pattern,
	bars,
	activeCell,
	tab,
	onTabChange,
	onBarChordChange,
	progressions,
	progressionsLoading,
	selectedProgressionId,
	onSelectProgression,
	onAddProgression,
	onEditProgression,
	onDeleteProgression,
	onProgressionBarChord,
	onEditPattern,
	patternSync = null,
	onApplyPatternSync,
	onDeclinePatternSync,
	onResumePatternSync,
	onDismissPatternNotice,
	onApplyChordShape,
	userVoicings = [],
	onSaveVoicing,
}: Props) {
	const selected = progressions.find((p) => p.id === selectedProgressionId) ?? null;

	// The add control is a chord line the user types straight into: click it and
	// it becomes an input, and the typed sequence becomes the progression. The
	// full editor is reserved for changing one that already exists.
	const [composerOpen, setComposerOpen] = useState(false);
	const [chordInput, setChordInput] = useState("");
	const [composerError, setComposerError] = useState<string | null>(null);
	// Raised when the typed line holds chords the library does not have. There is
	// no safe default — dropping them loses bars, keeping them writes bars that do
	// not sound — so the player answers rather than the composer guessing.
	const [unknownPrompt, setUnknownPrompt] = useState(false);
	// Which answer the arrow keys are resting on. The prompt appears under a
	// focused text input, so it is walked from there rather than tabbed into —
	// taking focus away would put the caret somewhere the player did not ask for.
	const [unknownChoice, setUnknownChoice] = useState(0);
	const unknownAnswersId = useId();
	// Deleting a progression cannot be undone, so the trash icon asks first.
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	// Phone only: the list slides out from the left and pushes the open
	// progression across, rather than replacing it. Always open from md upwards.
	const [railOpen, setRailOpen] = useState(false);
	// Fetched the first time the composer opens, then shared by every parse.
	const [chordIndex, setChordIndex] = useState<readonly ChordIndexEntry[]>([]);
	// How the open progression announces its chords: by name, or as the shape to
	// hold. The shapes are fetched only while the diagrams are on screen.
	const [chordView, setChordView] = useState<ChordView>("name");
	// A progression inherits its pattern's meter — the chords change, the way the
	// bar is counted does not.
	const meter = patternMeter(pattern);

	// A bar of the open sequence whose chord is being swapped for another out of
	// the library. Null while the picker is closed.
	const [chordPickerBar, setChordPickerBar] = useState<number | null>(null);

	// The bar whose shape is being written. One state for both kinds: a chord the
	// library has is being re-shaped, a bar kept as a name is being turned into a
	// chord, and both end in exactly one stored shape.
	const [shapeEditBar, setShapeEditBar] = useState<number | null>(null);
	const editingBar = shapeEditBar !== null ? (bars[shapeEditBar] ?? null) : null;
	const editingChord = editingBar?.chord ?? null;
	// The name a bar was kept under, which the dialog turns into a chord identity.
	const editingKeptName = editingBar ? barPlaceholder(editingBar) : null;
	// What that bar is drawing right now, recovered the same way the diagram was:
	// from the shared cache, through the same selector.
	const editingVoicing = editingChord
		? selectRefVoicing(
				editingChord,
				mergeVoicings(
					peekVoicings(editingChord.root, editingChord.suffix) ?? [],
					userVoicings,
					editingChord.root,
					editingChord.suffix,
				),
			)
		: null;

	/**
	 * Bars on screen the shape being written could reach — the ones playing the
	 * same chord, or, for a chord being named, the ones kept under the same name.
	 */
	const matchingBarCount = editingKeptName
		? bars.filter((bar) => barPlaceholder(bar) === editingKeptName).length
		: editingChord
			? bars.filter(
					(bar) =>
						bar.chord?.root === editingChord.root &&
						bar.chord?.suffix === editingChord.suffix,
				).length
			: 0;

	function handleApplyShape(voicing: UserChordVoicing, scope: ApplyScope) {
		if (shapeEditBar === null) return;
		// Pin what was stored, not what was minted: an identical shape already on
		// record keeps its own id, and pinning the fresh one would point the bar
		// at a row that was never written.
		const stored = onSaveVoicing?.(voicing) ?? voicing;
		onApplyChordShape?.(shapeEditBar, stored, scope);
	}
	// Both tabs: the pattern tab's chords are session-only, but looking at the
	// shape you are playing is as useful there as anywhere.
	const barDiagrams = useBarChordDiagrams(bars, chordView === "diagram", userVoicings);

	useEffect(() => {
		if (!composerOpen || chordIndex.length > 0) return;
		let cancelled = false;
		getChordIndex()
			.then((index) => {
				if (!cancelled) setChordIndex(index);
			})
			.catch((e: unknown) => console.error("[PatternWorkspace] chord index:", e));
		return () => {
			cancelled = true;
		};
	}, [composerOpen, chordIndex.length]);

	// A chord the player wrote a shape for is a chord they can write again, so
	// their own chords are searchable beside the library's.
	const searchIndex = chordIndexWithUser(chordIndex, userVoicings);
	// Voicings are only needed once a shape is actually written into the line —
	// a sequence of names never pays for them.
	const shapeCorpus = useChordShapeCorpus(composerOpen && hasShapeToken(chordInput));
	// What the typed line resolves to right now — the preview under the input.
	const parsed = parseChordSequence(chordInput, searchIndex, (frets) =>
		shapeCorpus ? resolveShapeToChord(shapeCorpus, frets) : null,
	);
	/** Shapes in the line that nothing is held with — chords waiting to be written. */
	const unwritten = parsed.tokens.filter((t) => t.shape && t.chord === null);
	const { goToCreateChord } = useChordSearchNavigation(closeComposer);
	// Presets still worth offering for what has been typed so far.
	const matchingPresets = filterPresets(PROGRESSION_PRESETS, chordInput);

	function openComposer() {
		setChordInput("");
		setComposerError(null);
		setUnknownPrompt(false);
		setComposerOpen(true);
	}

	/** Drops a preset into the input rather than creating it outright, so it can
	 *  be transposed or trimmed first — and unknown chords are still confirmed. */
	function applyPreset(preset: ProgressionPreset) {
		setChordInput(preset.chords);
		setComposerError(null);
		setUnknownPrompt(false);
	}

	function closeComposer() {
		setComposerOpen(false);
		setChordInput("");
		setComposerError(null);
		setUnknownPrompt(false);
	}

	/**
	 * `answer` is the reply to the unknown-chord prompt; null means it has not
	 * been asked yet, which is what pressing Enter on a fresh line does.
	 */
	function submitComposer(answer: UnknownChordChoice | null = null) {
		if (chordIndex.length === 0) {
			setComposerError("Still loading chords — try again in a moment.");
			return;
		}
		const { tokens, unmatched } = parsed;
		if (tokens.length === 0) {
			setComposerError("Type a chord sequence, e.g. C G Am F");
			return;
		}
		// Unknown chords are neither dropped nor kept behind the player's back.
		if (unmatched.length > 0 && answer === null) {
			setUnknownPrompt(true);
			setUnknownChoice(0);
			return;
		}
		const kept = keptTokens(tokens, answer ?? "skip");
		// Skipping every word there was leaves nothing to write down.
		if (kept.length === 0) {
			setUnknownPrompt(false);
			setComposerError(`No chord found for ${unmatched.join(", ")}`);
			return;
		}
		onAddProgression(kept);
		closeComposer();
	}

	/**
	 * The answers on offer. A shape nothing is held with adds a fourth and puts
	 * it first: the others all decide what to do *without* the chord, and this
	 * one is the chord.
	 */
	const unknownAnswers: UnknownOption[] = unwritten[0]
		? [
				{
					key: "create",
					label: `Write ${unwritten[0].input} down`,
					hint: "Nothing is held that way — draw it, name it, and it is yours",
				},
				...UNKNOWN_ANSWERS,
			]
		: [...UNKNOWN_ANSWERS];

	/** Act on one of the answers; "edit" is simply returning to the line. */
	function answerUnknown(answer: UnknownAnswer) {
		if (answer === "edit") {
			setUnknownPrompt(false);
			return;
		}
		if (answer === "create") {
			writeUnwritten();
			return;
		}
		submitComposer(answer);
	}

	/**
	 * Leave for the page where a shape becomes a chord. The composer closes on the
	 * way out — the line cannot survive the navigation, and a half-open composer
	 * behind a page change is worse than a clean one on return.
	 */
	function writeUnwritten() {
		const first = unwritten[0];
		if (first) goToCreateChord(first.input);
	}

	/** `rail` is the compact form used beside an open progression. */
	function composer(variant: "full" | "rail") {
		const rail = variant === "rail";
		if (!composerOpen) {
			return (
				<button
					type="button"
					onClick={openComposer}
					aria-label="Add progression"
					className={`flex items-center justify-center gap-1.5 border border-dashed border-line-strong text-ink-dim transition-colors hover:border-denim hover:text-denim ${
						rail ? "mt-1 py-1.5 text-[11px]" : "px-3 py-2 text-xs"
					}`}
				>
					<Plus size={rail ? 11 : 12} />
					{rail ? "Add" : "Add progression"}
				</button>
			);
		}
		return (
			<div className={`flex flex-col gap-1 ${rail ? "mt-1" : "w-full max-w-80"}`}>
				<input
					autoFocus
					value={chordInput}
					onChange={(e) => {
						setChordInput(e.target.value);
						if (composerError) setComposerError(null);
						// A new keystroke re-opens the question the answer settled.
						if (unknownPrompt) setUnknownPrompt(false);
					}}
					// Claimed only while the answers are actually on screen; the rest of
					// the time this is a plain text field.
					role={unknownPrompt ? "combobox" : undefined}
					aria-expanded={unknownPrompt ? true : undefined}
					aria-controls={unknownPrompt ? unknownAnswersId : undefined}
					aria-activedescendant={
						unknownPrompt ? `${unknownAnswersId}-${unknownChoice}` : undefined
					}
					onKeyDown={(e) => {
						// While the prompt is up the arrows walk the answers rather than
						// the caret: there is a question on screen waiting to be answered,
						// and the line behind it cannot be edited until it is.
						if (
							unknownPrompt &&
							(e.key === "ArrowRight" ||
								e.key === "ArrowDown" ||
								e.key === "ArrowLeft" ||
								e.key === "ArrowUp")
						) {
							e.preventDefault();
							const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
							setUnknownChoice(
								(i) => (i + step + unknownAnswers.length) % unknownAnswers.length,
							);
						} else if (e.key === "Enter") {
							e.preventDefault();
							// Straight to writing the shape down, without answering a
							// question whose answer is already known: the line has frets in
							// it that nothing is held with, and that is what to do about it.
							if ((e.metaKey || e.ctrlKey) && unwritten.length > 0) {
								writeUnwritten();
							} else if (unknownPrompt) {
								answerUnknown(unknownAnswers[unknownChoice]?.key ?? "edit");
							} else {
								submitComposer(null);
							}
						} else if (e.key === "Escape") {
							e.preventDefault();
							closeComposer();
						}
					}}
					placeholder="C G Am F, or 007707"
					aria-label="Chord sequence"
					className={`w-full border bg-surface font-mono text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent ${
						composerError ? "border-destructive" : "border-line-strong"
					} ${rail ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-sm"}`}
				/>

				{/* Live read-out of what the line resolves to, chord by chord. */}
				{parsed.tokens.length > 0 && (
					<div className="flex flex-wrap items-center gap-1 border border-line bg-surface px-2 py-1.5">
						{parsed.tokens.map((token, i) => (
							<span
								key={`${token.input}-${i}`}
								className={`border px-1.5 py-0.5 font-mono text-[11px] ${
									token.chord
										? "border-denim-border bg-denim-tint text-denim"
										: "border-destructive/40 text-destructive"
								}`}
								title={
									token.chord
										? undefined
										: token.shape
											? `Nothing is held like ${token.input} — ${WRITE_SHORTCUT} writes it down`
											: `${token.input} is not in the library — keep it as a silent bar, or skip it`
								}
							>
								{token.chord ? chordAbbreviation(token.chord) : token.input}
							</span>
						))}
					</div>
				)}

				{composerError ? (
					<p className="text-[10px] text-destructive">{composerError}</p>
				) : unknownPrompt ? (
					<div className="flex flex-col gap-1">
						<span className="text-[10px] text-destructive">
							{unwritten.length === parsed.unmatched.length
								? `Nothing is held like ${parsed.unmatched.join(", ")}.`
								: `${parsed.unmatched.join(", ")} not in the chord library.`}
						</span>
						<div
							id={unknownAnswersId}
							role="listbox"
							aria-label="What to do with the chords that were not found"
							className="flex flex-wrap items-center gap-2"
						>
							{unknownAnswers.map((answer, i) => {
								const active = i === unknownChoice;
								return (
									<button
										key={answer.key}
										id={`${unknownAnswersId}-${i}`}
										type="button"
										role="option"
										aria-selected={active}
										title={answer.hint}
										// Keeps focus in the input, so the arrows keep working
										// after a click and the line stays editable.
										onMouseDown={(e) => e.preventDefault()}
										onMouseEnter={() => setUnknownChoice(i)}
										onClick={() => answerUnknown(answer.key)}
										className={`border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
											active
												? "border-denim bg-denim text-on-denim"
												: "border-line-strong text-ink-dim hover:border-denim hover:text-denim"
										}`}
									>
										{answer.label}
									</button>
								);
							})}
						</div>
						<p className="text-[10px] text-ink-faint">
							&larr; &rarr; to choose, Enter to confirm.
						</p>
					</div>
				) : (
					<p className="text-[10px] text-ink-faint">
						{unwritten.length > 0
							? `Nothing is held like ${unwritten[0].input} — ${WRITE_SHORTCUT} to write it down.`
							: "One chord per bar, by name or by shape. Enter to add, Esc to cancel."}
					</p>
				)}

				{/* Known progressions to start from, narrowing as the line is typed.
				    Kept below the read-out, so what the user wrote always reads first. */}
				{matchingPresets.length > 0 && (
					<div className="flex max-h-56 flex-col overflow-y-auto border border-line bg-surface">
						{groupPresets(matchingPresets).map(({ group, presets }) => (
							<div key={group}>
								<p className="sticky top-0 bg-surface px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
									{group}
								</p>
								{presets.map((preset) => (
									<button
										key={preset.id}
										type="button"
										// Keeps focus in the input, so the line can be edited
										// straight after picking one.
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => applyPreset(preset)}
										className="flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left transition-colors hover:bg-denim-tint"
									>
										<span className="flex w-full items-baseline justify-between gap-2">
											<span className="truncate text-[11px] font-semibold text-ink">
												{preset.name}
											</span>
											{!rail && (
												<span className="shrink-0 font-mono text-[9px] text-ink-faint">
													{preset.degrees}
												</span>
											)}
										</span>
										<span className="truncate font-mono text-[11px] text-denim">
											{preset.chords}
										</span>
									</button>
								))}
							</div>
						))}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 w-full flex-col">
			<div className="flex shrink-0 items-center gap-1">
				<TabButton active={tab === "pattern"} onClick={() => onTabChange("pattern")}>
					Pattern
				</TabButton>
				<TabButton
					active={tab === "progressions"}
					onClick={() => onTabChange("progressions")}
				>
					Progressions{progressions.length > 0 ? ` (${progressions.length})` : ""}
				</TabButton>
			</div>

			{/* The card header — pattern name and written rhythm — belongs to both
			    tabs; only the body below it switches. */}
			<StepGridCard pattern={pattern} onEditPattern={onEditPattern}>
				{tab === "pattern" ? (
					<PatternBarBody
						meter={meter}
						bars={bars}
						activeCell={activeCell}
						onBarChordChange={onBarChordChange}
						chordView={chordView}
						onChordViewChange={setChordView}
						barDiagrams={barDiagrams}
						onEditChordShape={onApplyChordShape ? setShapeEditBar : undefined}
					/>
				) : progressionsLoading ? (
					<p className="px-5 py-6 text-xs text-ink-dim">Loading progressions…</p>
				) : progressions.length === 0 ? (
					<div className="flex min-h-0 flex-col items-start gap-3 overflow-y-auto px-5 py-6">
						<p className="text-xs text-ink-dim">
							No chord progressions yet. Type a chord sequence to play {pattern.name}{" "}
							over it.
						</p>
						{composer("full")}
					</div>
				) : selected === null ? (
					// Nothing opened yet: the list gets the whole body.
					<div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-5 py-5">
						{progressions.map((progression) => (
							<button
								key={progression.id}
								type="button"
								onClick={() => {
									setDeleteConfirmId(null);
									onSelectProgression(progression.id);
								}}
								className="flex items-center justify-between gap-3 border border-line-strong px-3 py-2 text-left transition-colors hover:border-denim hover:bg-denim-tint"
							>
								<span className="flex min-w-0 items-center gap-2">
									<Music size={12} className="shrink-0 text-ink-faint" />
									<span className="truncate text-sm text-ink">
										{progressionDisplayName(progression)}
									</span>
								</span>
								<span className="shrink-0 font-mono text-[9px] text-ink-faint">
									{progression.bars.length} bars
								</span>
							</button>
						))}
						{composer("full")}
					</div>
				) : (
					// One opened: the list shrinks to a rail on the left of the body.
					<div className="flex min-h-0">
						{/* Width animates 0 → 9rem on a phone, pushing the progression
						    right; the inner column keeps its width so nothing reflows. */}
						<div
							className={`shrink-0 overflow-hidden transition-[width] duration-200 md:w-44 ${
								railOpen ? "w-36" : "w-0"
							}`}
						>
							<div className="flex h-full w-36 flex-col gap-1 overflow-y-auto border-r border-line p-2 md:w-44">
								{progressions.map((progression) => {
									const isOpen = progression.id === selected.id;
									return (
										<button
											key={progression.id}
											type="button"
											onClick={() => {
												setDeleteConfirmId(null);
												// On a phone the list has done its job once one is picked.
												setRailOpen(false);
												onSelectProgression(progression.id);
											}}
											className={`truncate border px-2 py-1.5 text-left text-xs transition-colors ${
												isOpen
													? "border-denim bg-denim-tint text-denim"
													: "border-transparent text-ink-dim hover:border-line-strong hover:text-ink"
											}`}
										>
											{progressionDisplayName(progression)}
										</button>
									);
								})}
								{composer("rail")}
							</div>
						</div>

						<div className="flex min-h-0 min-w-0 flex-1 flex-col">
							{/* The progression's own strip, under the pattern's header. */}
							{/* h-11: the strip keeps its height whether it shows the controls
							    or the delete confirmation, so nothing below it jumps. */}
							<div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3 md:px-5">
								<div className="flex min-w-0 items-center gap-2">
									<button
										type="button"
										onClick={() => setRailOpen((open) => !open)}
										aria-label={railOpen ? "Hide the progression list" : "Show the progression list"}
										aria-expanded={railOpen}
										title="All progressions"
										className={`flex shrink-0 items-center justify-center p-1.5 transition-colors hover:bg-denim-tint hover:text-denim md:hidden ${
											railOpen ? "text-denim" : "text-ink-dim"
										}`}
									>
										<List size={14} />
									</button>
									<span className="truncate text-sm font-semibold text-ink">
										{progressionDisplayName(selected)}
									</span>
									<span className="shrink-0 font-mono text-[10px] text-ink-faint">
										{selected.bars.length} bars
									</span>
									{/* The chords name the shapes; the capo says how much higher
									    they sound. Hidden at capo 0, where there is nothing to say. */}
									{progressionCapo(selected) > 0 && (
										<span className="shrink-0 border border-denim-border bg-denim-tint px-1.5 py-0.5 font-mono text-[10px] text-denim">
											Capo {progressionCapo(selected)}
										</span>
									)}
								</div>
								{deleteConfirmId === selected.id ? (
									<div className="flex shrink-0 items-center gap-2">
										<span className="text-[11px] text-ink-dim">
											Delete<span className="hidden sm:inline"> this progression</span>?
										</span>
										<button
											type="button"
											onClick={() => {
												setDeleteConfirmId(null);
												onDeleteProgression(selected);
											}}
											className="px-2 py-0.5 text-[11px] font-semibold text-white bg-destructive transition-colors hover:bg-destructive/90"
										>
											Delete
										</button>
										<button
											type="button"
											onClick={() => setDeleteConfirmId(null)}
											className="px-1 text-[11px] text-ink-dim transition-colors hover:text-ink"
										>
											Cancel
										</button>
									</div>
								) : (
									<div className="flex shrink-0 items-center">
										<ChordViewToggle value={chordView} onChange={setChordView} />
										<button
											type="button"
											onClick={() => onEditProgression(selected)}
											aria-label="Edit progression"
											title="Edit progression"
											className="flex items-center justify-center p-1.5 text-ink-dim transition-colors hover:bg-denim-tint hover:text-denim"
										>
											<Pencil size={14} />
										</button>
										<button
											type="button"
											onClick={() => setDeleteConfirmId(selected.id)}
											aria-label="Delete progression"
											title="Delete progression"
											className="flex items-center justify-center p-1.5 text-ink-dim transition-colors hover:bg-denim-tint hover:text-destructive"
										>
											<Trash2 size={14} />
										</button>
									</div>
								)}
							</div>
							{/* The pattern moved under this sequence. Asked here, where the
							    sequence is on screen and the answer can be judged, rather than
							    applied on the pattern's save where it could not be. Inline
							    rather than a dialog: it is a question about what is behind it,
							    and blocking the view of the thing in question helps nobody. */}
							{patternSync === "ask" && (
								<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-destructive bg-destructive-tint px-3 py-2 sm:px-5">
									<span className="min-w-0 flex-1 font-mono text-[11px] leading-snug tracking-[0.04em] text-ink-dim">
										The pattern&rsquo;s rhythm has changed since this sequence was
										written. Apply it here?
									</span>
									<button
										type="button"
										onClick={onApplyPatternSync}
										className="flex h-(--h-control) items-center border border-denim px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent transition-colors hover:bg-denim hover:text-on-denim"
									>
										Apply
									</button>
									<button
										type="button"
										onClick={onDeclinePatternSync}
										className="flex h-(--h-control) items-center border border-line-strong px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors hover:border-denim hover:text-denim-accent"
									>
										Keep mine
									</button>
								</div>
							)}
							{/* Declining is a state, not a silence: a one-way door the player
							    cannot see they walked through is the failure mode here. */}
							{patternSync === "detached" && (
								<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 sm:px-5">
									<span className="min-w-0 flex-1 font-mono text-[11px] tracking-[0.04em] text-ink-faint">
										Not following the pattern&rsquo;s rhythm.
									</span>
									<button
										type="button"
										onClick={onResumePatternSync}
										className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim underline-offset-2 transition-colors hover:text-denim-accent hover:underline"
									>
										Follow again
									</button>
									{/* Saying no is about the rhythm; this is about being told. A
									    player who has settled on their own rhythm does not need a
									    standing reminder, but one who has just decided might. */}
									<button
										type="button"
										onClick={onDismissPatternNotice}
										aria-label="Dismiss this notice for good"
										title="Dismiss for good"
										className="flex items-center justify-center p-1 text-ink-faint transition-colors hover:text-ink-dim"
									>
										<X size={12} />
									</button>
								</div>
							)}

							{/* Scrolls internally; playback keeps the current bar in view. */}
							<div className="flex min-h-0 flex-col items-center overflow-y-auto px-3 py-5 sm:px-5">
								<div className="my-auto w-full">
									<StepGrid
										bars={bars}
										activeCell={activeCell}
										meter={meter}
										chordView={chordView}
										barDiagrams={barDiagrams}
										onEditChordShape={
											onApplyChordShape ? setShapeEditBar : undefined
										}
										// Changing a chord where it is read, rather than only
										// inside the editor — the editor is for rewriting the
										// sequence, not for swapping one chord in it.
										onChordClick={
											onProgressionBarChord ? setChordPickerBar : undefined
										}
										// A kept name has no chord to swap and no shape on
										// record, so it goes to the shape editor instead.
										onPlaceholderClick={
											onApplyChordShape ? setShapeEditBar : undefined
										}
									/>
								</div>
							</div>
						</div>
					</div>
				)}
			</StepGridCard>

			<ChordPickerModal
				open={chordPickerBar !== null}
				onClose={() => setChordPickerBar(null)}
				onConfirm={(chord) => {
					if (chordPickerBar !== null) onProgressionBarChord?.(chordPickerBar, chord);
					setChordPickerBar(null);
				}}
				initialChord={chordPickerBar !== null ? bars[chordPickerBar]?.chord : null}
			/>

			{(editingChord || editingKeptName) && (
				<ChordShapeModal
					open={shapeEditBar !== null}
					chord={editingChord}
					namingFrom={editingKeptName ?? undefined}
					initialVoicing={editingVoicing}
					onClose={() => setShapeEditBar(null)}
					onApply={handleApplyShape}
					matchingBarCount={matchingBarCount}
				/>
			)}
		</div>
	);
}
