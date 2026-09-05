"use client";

import { useEffect, useState } from "react";
import { Guitar, List, Music, Pencil, Plus, Trash2, Type } from "lucide-react";
import type { Bar, ChordProgression, ChordRef, StrumPattern } from "@/lib/strumPatterns";
import {
	progressionDisplayName,
	progressionCapo,
	chordAbbreviation,
	parseChordSequence,
} from "@/lib/strumProgressions";
import {
	PROGRESSION_PRESETS,
	filterPresets,
	groupPresets,
	type ProgressionPreset,
} from "@/lib/strumProgressionPresets";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import StepGrid, { type ActiveCell, type ChordView } from "./StepGrid";
import { useBarChordDiagrams } from "./useBarChordDiagrams";
import StepGridCard from "./StepGridCard";
import PatternBarBody from "./PatternBarBody";
import { type ConfirmedChord } from "./ChordPickerModal";

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
	/** Create a progression from a typed chord sequence, one bar per chord. */
	onAddProgression: (chords: ChordRef[]) => void;
	onEditProgression: (progression: ChordProgression) => void;
	onDeleteProgression: (progression: ChordProgression) => void;
	/** Given only for a pattern the user owns; presets cannot be edited. */
	onEditPattern?: () => void;
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
	onEditPattern,
}: Props) {
	const selected = progressions.find((p) => p.id === selectedProgressionId) ?? null;

	// The add control is a chord line the user types straight into: click it and
	// it becomes an input, and the typed sequence becomes the progression. The
	// full editor is reserved for changing one that already exists.
	const [composerOpen, setComposerOpen] = useState(false);
	const [chordInput, setChordInput] = useState("");
	const [composerError, setComposerError] = useState<string | null>(null);
	// Raised when the typed line holds chords the library does not have: creating
	// anyway drops them, so the user confirms first.
	const [skipConfirm, setSkipConfirm] = useState(false);
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
	const barDiagrams = useBarChordDiagrams(
		bars,
		chordView === "diagram" && tab === "progressions",
	);

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

	// What the typed line resolves to right now — the preview under the input.
	const parsed = parseChordSequence(chordInput, chordIndex);
	// Presets still worth offering for what has been typed so far.
	const matchingPresets = filterPresets(PROGRESSION_PRESETS, chordInput);

	function openComposer() {
		setChordInput("");
		setComposerError(null);
		setSkipConfirm(false);
		setComposerOpen(true);
	}

	/** Drops a preset into the input rather than creating it outright, so it can
	 *  be transposed or trimmed first — and unknown chords are still confirmed. */
	function applyPreset(preset: ProgressionPreset) {
		setChordInput(preset.chords);
		setComposerError(null);
		setSkipConfirm(false);
	}

	function closeComposer() {
		setComposerOpen(false);
		setChordInput("");
		setComposerError(null);
		setSkipConfirm(false);
	}

	/** `skipUnknown` is the answer to the "skip it and carry on?" prompt. */
	function submitComposer(skipUnknown = false) {
		if (chordIndex.length === 0) {
			setComposerError("Still loading chords — try again in a moment.");
			return;
		}
		const { chords, unmatched } = parsed;
		if (chords.length === 0) {
			setComposerError(
				unmatched.length > 0
					? `No chord found for ${unmatched.join(", ")}`
					: "Type a chord sequence, e.g. C G Am F",
			);
			return;
		}
		// Unknown chords are not silently dropped: the user is asked first.
		if (unmatched.length > 0 && !skipUnknown) {
			setSkipConfirm(true);
			return;
		}
		onAddProgression(chords);
		closeComposer();
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
						// A new keystroke re-opens the question the confirmation answered.
						if (skipConfirm) setSkipConfirm(false);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							submitComposer(skipConfirm);
						} else if (e.key === "Escape") {
							e.preventDefault();
							closeComposer();
						}
					}}
					placeholder="C G Am F"
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
										: "border-destructive/40 text-destructive line-through"
								}`}
								title={token.chord ? undefined : `${token.input} is not in the library`}
							>
								{token.chord ? chordAbbreviation(token.chord) : token.input}
							</span>
						))}
					</div>
				)}

				{composerError ? (
					<p className="text-[10px] text-destructive">{composerError}</p>
				) : skipConfirm ? (
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-[10px] text-destructive">
							{parsed.unmatched.join(", ")} not found — skip and create?
						</span>
						<button
							type="button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => submitComposer(true)}
							className="border border-denim px-2 py-0.5 text-[10px] font-semibold text-denim transition-colors hover:bg-denim-tint"
						>
							Skip &amp; create
						</button>
						<button
							type="button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => setSkipConfirm(false)}
							className="px-1 text-[10px] text-ink-dim transition-colors hover:text-ink"
						>
							Keep editing
						</button>
					</div>
				) : (
					<p className="text-[10px] text-ink-faint">
						One chord per bar. Enter to add, Esc to cancel.
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
						bars={bars}
						activeCell={activeCell}
						onBarChordChange={onBarChordChange}
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
										<button
											type="button"
											onClick={() =>
												setChordView((view) => (view === "name" ? "diagram" : "name"))
											}
											aria-label={
												chordView === "name"
													? "Show chord diagrams"
													: "Show chord names"
											}
											aria-pressed={chordView === "diagram"}
											title={
												chordView === "name"
													? "Show chord diagrams"
													: "Show chord names"
											}
											className={`flex items-center justify-center p-1.5 transition-colors hover:bg-denim-tint hover:text-denim ${
												chordView === "diagram" ? "text-denim" : "text-ink-dim"
											}`}
										>
											{chordView === "name" ? <Guitar size={14} /> : <Type size={14} />}
										</button>
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
							{/* Scrolls internally; playback keeps the current bar in view. */}
							<div className="flex min-h-0 flex-col items-center overflow-y-auto px-3 py-5 sm:px-5">
								<div className="my-auto w-full">
									<StepGrid
										bars={bars}
										activeCell={activeCell}
										chordView={chordView}
										barDiagrams={barDiagrams}
									/>
								</div>
							</div>
						</div>
					</div>
				)}
			</StepGridCard>
		</div>
	);
}
