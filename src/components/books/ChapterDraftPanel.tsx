"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CirclePause, CirclePlay, CircleStop, Loader2, Pencil, Repeat } from "lucide-react";
import { toast } from "sonner";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import type { ChapterExercise } from "@/lib/books/types";
import { cropUrl, setExerciseStatus } from "@/lib/books/api";
import { stashHandoff } from "@/lib/strumAssistant/handoff";
import { expandFingerpickPattern } from "@/lib/fingerpickRepeats";
import { clampBpmToMeter } from "@/lib/strumBars";
import { beatUnitGlyph } from "@/lib/strumMeter";
import { shouldRunPageShortcut } from "@/lib/keyboardShortcuts";
import { createClient } from "@/lib/supabase";
import { saveLastPattern } from "@/lib/lastPattern";
import { saveUserFingerpickPattern } from "@/lib/fingerpickPatternSync";
import { useUser } from "@/hooks/useUser";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFingerpickPatterns } from "@/components/fingerpick/useFingerpickPatterns";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import { useTempo } from "@/components/fingerpick/useTempo";
import { usePlaybackCursor } from "@/components/fingerpick/usePlaybackCursor";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import FingerpickEditModal from "@/components/fingerpick/FingerpickEditModal";
import Rocker from "@/components/ui/Rocker";
import { WarningsFold } from "@/components/books/IssueList";
import SidePanel from "@/components/books/SidePanel";
import { DenimButton, GhostButton, MONO_META } from "@/components/books/bookUi";

/**
 * A chapter draft open beside the book (#233). The page pushes its content
 * left and this takes the right half: the tab as the fingerpick page draws
 * it, a playhead, transport and tempo, and two ways out — Edit, which opens
 * the fingerpick editor on the draft and saves it to the player's library
 * through the same save that page uses; and Open in fingerpick, which takes
 * it there (by handoff while it is still a draft, by id once it is saved).
 *
 * The draft's row is marked `taken` on either of those, not on playing: a
 * draft that was only listened to has not been used.
 *
 * One instance per draft — the page keys it on the exercise — so a switch
 * starts clean: a fresh audio context, the new draft's tempo, the cursor at
 * bar one. Unmounting stops playback and closes the context.
 */

const FINGERPICK_PATH = "/fingerpick";

export interface OpenDraft {
	/** The chapter the draft was read in — the source panel's page range. */
	chapterId: string;
	exercise: ChapterExercise;
	/** The exercise's draft, validated (see `ChapterCard.openDraft`). */
	pattern: FingerpickPattern;
	/** Marks the card's row taken once the draft is saved or leaves for fingerpick. */
	onTaken: () => void;
}

const KIND_LABEL: Record<ChapterExercise["kind"], string> = {
	strum: "Strum",
	progression: "Progression",
	tab: "Tab",
	chord_diagram: "Chord",
};

/** The tempo, meter and length half of the line under the name; the page and provenance follow. */
export function draftMeta(pattern: FingerpickPattern): string {
	const bars = pattern.measures.length;
	return [
		`${beatUnitGlyph(pattern.timeSignature)} = ${pattern.bpm}`,
		`${pattern.timeSignature[0]}/${pattern.timeSignature[1]}`,
		`${bars} ${bars === 1 ? "bar" : "bars"}`,
	].join(" · ");
}

export default function ChapterDraftPanel({
	bookId,
	draft,
	onClose,
	onLocate,
	animateOpen,
}: {
	bookId: string;
	draft: OpenDraft;
	onClose: () => void;
	/** Show the page the draft was read from, in this panel's place (#240). */
	onLocate: () => void;
	/** See SidePanel: false when replacing a panel already open. */
	animateOpen?: boolean;
}) {
	const router = useRouter();
	const { user, loading } = useUser();
	// The library, for the save: it keeps names unique and knows whether a
	// pattern is new. Nothing here lists it.
	const { patterns, saveCustomPattern, isLoading: libraryLoading } = useFingerpickPatterns(user, loading);
	const { exercise } = draft;

	// Whatever id the service gave the draft, a save makes a new pattern of the
	// player's own: a fresh id keeps it from landing on one they already have.
	const [pattern, setPattern] = useState<FingerpickPattern>(() => ({
		...draft.pattern,
		id: crypto.randomUUID(),
	}));
	// Set by the first save; from then on the pattern on screen is the library's.
	const [saved, setSaved] = useState(false);
	const [editing, setEditing] = useState(false);
	const [opening, setOpening] = useState(false);

	// The editor opens inside the panel, not over the page: at lg the book's
	// column stays live beside it (the source image can be zoomed there); in
	// the sheet below lg it fills the sheet as before. A state, not a ref, so
	// the editor gets the element once it exists.
	const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);

	// Below lg nothing beside the editor can show the page, so the crop goes
	// into the editor as a fold-out strip instead. Signed only when needed.
	const split = useMediaQuery("(min-width: 1024px)", true);
	const [cropSrc, setCropSrc] = useState<string | null>(null);
	const cropPath = split ? null : exercise.crop_path;
	useEffect(() => {
		if (!cropPath) return;
		let cancelled = false;
		void cropUrl(cropPath).then((url) => {
			if (!cancelled) setCropSrc(url);
		});
		return () => {
			cancelled = true;
		};
	}, [cropPath]);
	const reference = !split && cropSrc ? { url: cropSrc, alt: `Page ${exercise.page}, ${pattern.name}` } : undefined;

	// Repeats flattened for playback; the staves stay compact. See FingerpickWorkspace.
	const expanded = useMemo(() => expandFingerpickPattern(pattern), [pattern]);

	const {
		isLoaded,
		isPlaying,
		isPaused,
		playOnce,
		setPlayOnce,
		load,
		play,
		pause,
		resume,
		stop,
		getPlaybackProgress,
		applyBpmChange,
	} = useFingerpickAudioEngine();

	const patternBpm = clampBpmToMeter(pattern.bpm, pattern.timeSignature);
	// Only the two ±10 steps here; the page has the fader, tap and reset.
	const { bpm, resetBpm, handleBpmChange } = useTempo({
		initialBpm: patternBpm,
		timeSignature: pattern.timeSignature,
		isPlaying,
		pause,
		resume,
		applyBpmChange,
	});

	// Samples load once per mount, so the first Play is not the first fetch —
	// once the panel has finished opening (SidePanel's onOpened): the load
	// opens the AudioContext, which can take a good part of a second, and done
	// during the motion it would freeze it.

	// The staves are packed to the panel's real width, known once it is on
	// screen. The viewer arrives a frame after this component (SidePanel mounts
	// its body late), so it is watched from a state, not a mount-time ref.
	const tabViewerRef = useRef<HTMLDivElement>(null);
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
		() => layoutMeasureRows(pattern.measures, containerWidth, 0),
		[pattern.measures, containerWidth],
	);

	const { cursorRef, measureHighlightRef, rowRefs, resetCursor } = usePlaybackCursor({
		tabViewerRef,
		expanded,
		bpm,
		rows,
		isPlaying,
		getPlaybackProgress,
	});

	function handlePlay() {
		// forceLetRing, as the page plays: the fuller fingerstyle sustain, with
		// the pattern data untouched.
		play({ ...expanded.pattern, bpm }, { loop: true, forceLetRing: true });
	}

	function handlePlayPause() {
		if (isPlaying) pause();
		else if (isPaused) resume();
		else handlePlay();
	}

	function handleStop() {
		stop();
		resetCursor();
	}

	// Space plays and pauses, as on the fingerpick page — not in a field, not
	// behind the editor. Subscribed once, through a ref, for the same reason.
	const playPauseRef = useRef(handlePlayPause);
	useEffect(() => {
		playPauseRef.current = handlePlayPause;
	});
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.code !== "Space" || !shouldRunPageShortcut(e)) return;
			e.preventDefault();
			playPauseRef.current();
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	function markTaken() {
		draft.onTaken();
		// Bookkeeping: the draft is used whether or not the row learns it now.
		void setExerciseStatus(bookId, exercise.id, "taken").catch(() => {});
	}

	// The editor's save, through the library's own: the name is kept unique,
	// a guest's copy goes to the browser and a player's to the account. The
	// panel then shows what was stored, at its tempo, from bar one.
	function handleSave(next: FingerpickPattern) {
		stop();
		const { pattern: stored } = saveCustomPattern(next);
		setPattern(stored);
		setSaved(true);
		resetBpm(clampBpmToMeter(stored.bpm, stored.timeSignature));
		resetCursor();
		markTaken();
		if (user) toast(`Saved "${stored.name}" to your patterns.`);
		else toast(`Saved "${stored.name}" to this browser.`, { description: "Sign in to keep it on your account." });
	}

	// A draft goes over the way the assistant's tabs do and opens in the
	// editor there; a saved pattern is already in the library, so the page is
	// opened on it by id — after the row is confirmed written, since the
	// library's save does not wait and the page reads the library on load.
	async function handleOpenInFingerpick() {
		if (opening) return;
		setOpening(true);
		stop();
		markTaken();
		if (!saved) {
			stashHandoff({ kind: "fingerpick", pattern, warnings: exercise.warnings });
			router.push(FINGERPICK_PATH);
			return;
		}
		try {
			const supabase = createClient();
			await saveUserFingerpickPattern(supabase, user, pattern);
			await saveLastPattern(supabase, user, "fingerpick", pattern.id);
			router.push(`${FINGERPICK_PATH}?pattern=${pattern.id}`);
		} catch (e) {
			console.error(e);
			toast.error("Couldn't open the pattern — try again.");
			setOpening(false);
		}
	}

	return (
		<SidePanel
			label={saved ? "Practice draft · saved" : "Practice draft"}
			ariaLabel="Practice draft"
			onClose={onClose}
			onOpened={() => void load()}
			animateOpen={animateOpen}
			panelRef={setPanelEl}
			testId="chapter-draft-panel"
		>
			<div className="relative flex-none border-b border-line px-4 py-3">
				<p className="truncate text-[15px] font-semibold text-ink">{pattern.name}</p>
				<p className={`${MONO_META} mt-1 tabular-nums`}>
					{draftMeta(pattern)} ·{" "}
					<button
						type="button"
						onClick={onLocate}
						title="See this page of the book"
						className="inline-flex items-center gap-1 border border-line-strong px-1.5 py-0.5 transition-colors duration-(--dur-hover) hover:border-denim hover:text-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
					>
						p.{exercise.page}
						<ArrowUpRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
					</button>{" "}
					· {KIND_LABEL[exercise.kind]} · {exercise.source}
				</p>
				{/* The reader's warnings, folded; the open list floats over the tab. */}
				<WarningsFold issues={exercise.warnings} dropdown className="mt-1.5" />
			</div>

			{/* The tab, scrolling on its own. The overlays are positioned inside
			    it, as on the page (see FingerpickWorkspace for why they stack
			    above the rows). */}
			<div
				ref={(el) => {
					tabViewerRef.current = el;
					setViewerEl(el);
				}}
				data-tab-viewer
				className="relative min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-3"
			>
				<div
					ref={measureHighlightRef}
					aria-hidden="true"
					className="pointer-events-none absolute z-10"
					style={{ display: "none", backgroundColor: "var(--measure-hl)" }}
				/>
				<div
					ref={cursorRef}
					aria-hidden="true"
					className="pointer-events-none absolute z-10"
					style={{
						display: "none",
						width: 2,
						left: 0,
						backgroundColor: "var(--denim-accent)",
						boxShadow: "var(--glow-playhead)",
					}}
				>
					<span
						aria-hidden="true"
						style={{
							position: "absolute",
							top: -6,
							left: -4,
							width: 0,
							height: 0,
							borderLeft: "5px solid transparent",
							borderRight: "5px solid transparent",
							borderTop: "6px solid var(--denim-accent)",
						}}
					/>
				</div>
				<div className="flex flex-col pt-2">
					{rows.map((row, rowIdx) => (
						<div
							key={row.measures[0].id}
							ref={(el) => {
								rowRefs.current[rowIdx] = el;
							}}
						>
							<TabStaveRow
								measures={row.measures}
								timeSignature={pattern.timeSignature}
								startMeasureNumber={row.startMeasureNumber}
								startMeasureIndex={row.startMeasureNumber - 1}
								measureWidths={row.widths}
							/>
						</div>
					))}
				</div>
			</div>

			{/* One row: transport, loop, tempo in ±10 steps, and the two ways out.
			    It wraps where the panel is too narrow for all of it. */}
			<footer className="flex flex-none flex-wrap items-center gap-2 border-t border-line px-4 py-3">
				<button
					type="button"
					onClick={isLoaded ? handlePlayPause : undefined}
					disabled={!isLoaded}
					aria-label={!isLoaded ? "Loading samples" : isPlaying ? "Pause" : "Play"}
					className="flex h-9 w-14 items-center justify-center border border-denim bg-denim text-on-denim transition-colors hover:bg-denim-accent disabled:pointer-events-none disabled:opacity-30"
				>
					{!isLoaded ? (
						<Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
					) : isPlaying ? (
						<CirclePause size={18} strokeWidth={1.5} />
					) : (
						<CirclePlay size={18} strokeWidth={1.5} />
					)}
				</button>
				<button
					type="button"
					onClick={handleStop}
					disabled={!isPlaying && !isPaused}
					aria-label="Stop and return to start"
					className="flex h-9 w-10 items-center justify-center border border-line-strong text-ink-dim transition-colors hover:border-denim hover:text-denim disabled:pointer-events-none disabled:opacity-30"
				>
					<CircleStop size={18} strokeWidth={1.5} />
				</button>
				<span className="flex items-center gap-1.5 px-1 text-denim">
					<Repeat size={12} strokeWidth={2} aria-hidden="true" />
					<Rocker checked={!playOnce} onChange={(v) => setPlayOnce(!v)} ariaLabel="Loop" />
				</span>
				{/* The tempo group wraps as one, so the two steps never part. */}
				<span className="flex items-center gap-2">
					<span aria-hidden="true" className="h-5 w-px bg-line" />
					<TempoStep label="−10" onClick={() => handleBpmChange(bpm - 10)} />
					<span
						className="min-w-14 text-center font-mono text-[18px] font-bold leading-none tracking-[-0.02em] text-denim tabular-nums"
						title={`${beatUnitGlyph(pattern.timeSignature)} = ${bpm} · the pattern's own tempo is ${patternBpm}`}
					>
						{bpm}
						<span className="ml-1 text-[9px] font-normal tracking-[0.2em] text-ink-faint">BPM</span>
					</span>
					<TempoStep label="+10" onClick={() => handleBpmChange(bpm + 10)} />
				</span>
				<span className="ml-auto flex items-center gap-2">
					<GhostButton
						onClick={() => setEditing(true)}
						disabled={libraryLoading}
						title={libraryLoading ? "Loading your patterns…" : "Edit and save to your patterns"}
					>
						<Pencil className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
						Edit
					</GhostButton>
					<DenimButton onClick={handleOpenInFingerpick} disabled={opening}>
						Open in fingerpick
						<ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
					</DenimButton>
				</span>
			</footer>

			<FingerpickEditModal
				key={pattern.id}
				open={editing}
				pattern={pattern}
				takenNames={patterns.filter((p) => p.id !== pattern.id).map((p) => p.name)}
				container={panelEl}
				reference={reference}
				notice={
					saved
						? undefined
						: {
								title: "Check this pattern",
								text: "Read from the book's page — check the frets and the rhythm, then save it as your own.",
								warnings: exercise.warnings.map((w) => w.message),
							}
				}
				onClose={() => setEditing(false)}
				onSave={handleSave}
			/>
		</SidePanel>
	);
}

/** A ±10 step, in the fingerpick steppers' dress. */
function TempoStep({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={`Tempo ${label}`}
			className="h-9 w-12 border border-line-strong font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint"
		>
			{label}
		</button>
	);
}
