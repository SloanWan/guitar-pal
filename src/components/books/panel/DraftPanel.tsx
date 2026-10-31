"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Check, Pencil, Repeat, Square } from "lucide-react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import type { ChapterExercise } from "@/lib/books/types";
import { cropUrl, setExerciseStatus } from "@/lib/books/api";
import { stashHandoff } from "@/lib/assistant/handoff";
import { beatUnitGlyph } from "@/lib/strumMeter";
import { editorHref, stashEditorDraft } from "@/lib/tabEditorEntry";
import { Button, PlayPick } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Stepper } from "@/components/ui/stepper";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import IssueList from "@/components/books/IssueList";
import { KIND_LABEL } from "@/components/books/chapter/DraftRow";
import SidePanel from "@/components/books/panel/SidePanel";
import type { CropView } from "@/components/books/panel/CropDialog";
import { useDraftPlayback } from "@/components/books/panel/useDraftPlayback";
import { useNavRouter } from "@/components/nav-progress";

/**
 * A chapter draft open beside the book (#233, on Candy #404): how it plays —
 * a compact transport, tempo and loop over the tab as the Tab page draws it,
 * with a playhead — the reader's warnings, the crop it was read from, and two
 * ways out: Edit, which opens the tab editor's page on the draft with this
 * page of the book beside it, and Open in Tab, which takes it there (by
 * handoff while it is still a draft).
 *
 * The draft's row is marked `taken` on either of those (the editor marks it
 * when it saves), not on playing: a draft that was only listened to has not
 * been used.
 */

const TAB_PATH = "/fingerpick";

export interface OpenDraft {
	/** The chapter the draft was read in — the source panel's page range. */
	chapterId: string;
	exercise: ChapterExercise;
	/** The exercise's draft, validated (see `ChapterCard.openDraft`). */
	pattern: FingerpickPattern;
	/** Marks the card's row taken once the draft is saved or leaves for the Tab page. */
	onTaken: () => void;
}

/** The tempo, meter and length half of the line under the name; the page and provenance follow. */
export function draftMeta(pattern: FingerpickPattern): string {
	const bars = pattern.measures.length;
	return [
		`${beatUnitGlyph(pattern.timeSignature)} = ${pattern.bpm}`,
		`${pattern.timeSignature[0]}/${pattern.timeSignature[1]}`,
		`${bars} ${bars === 1 ? "bar" : "bars"}`,
	].join(" · ");
}

export default function DraftPanel({
	bookId,
	draft,
	onClose,
	onLocate,
	onViewCrop,
	animateOpen,
}: {
	bookId: string;
	draft: OpenDraft;
	onClose: () => void;
	/** Show the page the draft was read from, in this panel's place (#240). */
	onLocate: () => void;
	/** The crop at full size. */
	onViewCrop: (crop: CropView) => void;
	/** See SidePanel: false when replacing a panel already open. */
	animateOpen?: boolean;
}) {
	const router = useNavRouter();
	const pathname = usePathname();
	const { exercise } = draft;

	// Whatever id the service gave the draft, a save makes a new pattern of the
	// player's own: a fresh id keeps it from landing on one they already have.
	const [pattern] = useState<FingerpickPattern>(() => ({ ...draft.pattern, id: crypto.randomUUID() }));
	const [opening, setOpening] = useState(false);
	const [used, setUsed] = useState(exercise.status === "taken");
	const playback = useDraftPlayback(pattern);
	const { engine, rows, renderContext, viewer, cursorRef, measureHighlightRef, rowRefs } = playback;

	const crop = useCrop(exercise.crop_path);
	const cropAlt = `Page ${exercise.page}, ${pattern.name}`;

	function markTaken() {
		setUsed(true);
		draft.onTaken();
		// Bookkeeping: the draft is used whether or not the row learns it now.
		void setExerciseStatus(bookId, exercise.id, "taken").catch(() => {});
	}

	// The editor's page, with this page of the book beside it; its save goes
	// through the library's own (a guest's copy to the browser, a player's to
	// the account), marks the draft taken and comes back here.
	function handleEdit() {
		engine.stop();
		const token = stashEditorDraft({
			pattern,
			notice: {
				title: "Check this pattern",
				text: "Read from the book's page — check the frets and the rhythm, then save it as your own.",
				warnings: exercise.warnings.map((w) => w.message),
			},
			book: { bookId, exerciseId: exercise.id, cropPath: exercise.crop_path, page: exercise.page },
		});
		router.push(editorHref({ kind: "draft", token, from: pathname }));
	}

	// A draft goes over the way the assistant's tabs do and opens there.
	function handleOpenInTab() {
		if (opening) return;
		setOpening(true);
		engine.stop();
		markTaken();
		stashHandoff({ kind: "fingerpick", pattern, warnings: exercise.warnings });
		router.push(TAB_PATH);
	}

	return (
		<SidePanel
			eyebrow={`Draft · p.${exercise.page}`}
			title={pattern.name}
			meta={`${draftMeta(pattern)} · p.${exercise.page} · ${KIND_LABEL[exercise.kind]} · ${exercise.source}`}
			ariaLabel="Practice draft"
			onClose={onClose}
			onOpened={() => void engine.load()}
			animateOpen={animateOpen}
			testId="chapter-draft-panel"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={handleEdit} title="Edit and save to your tabs">
						<Pencil aria-hidden />
						Edit
					</Button>
					<span className="bk-grow" />
					{used ? (
						<span className="bk-st" data-tone="ok">
							<Check aria-hidden />
							Used
						</span>
					) : null}
					<Button size="sm" onClick={handleOpenInTab} loading={opening}>
						Open in Tab
						<ArrowUpRight aria-hidden />
					</Button>
				</>
			}
		>
			<div className="bk-trn">
				<PlayPick
					size="sm"
					playing={engine.isPlaying}
					disabled={!engine.isLoaded}
					aria-label={!engine.isLoaded ? "Loading samples" : engine.isPlaying ? "Pause" : "Play"}
					onClick={playback.playPause}
				/>
				<Button
					variant="icon"
					size="sm"
					aria-label="Stop and go back to the start"
					title="Stop"
					onClick={playback.stop}
					disabled={!engine.isPlaying && !engine.isPaused}
				>
					<Square fill="currentColor" aria-hidden />
				</Button>
				<span className="bk-grow" />
				<Stepper
					label="Tempo"
					value={playback.bpm}
					onChange={playback.setBpm}
					step={5}
					unit="BPM"
					size="sm"
					dense
				/>
				<Chip pressed={!engine.playOnce} onPressedChange={(loop) => engine.setPlayOnce(!loop)} aria-label="Loop">
					<Repeat aria-hidden />
					Loop
				</Chip>
			</div>

			{exercise.warnings.length > 0 ? <IssueList issues={exercise.warnings} /> : null}

			<div>
				<p className="bk-lbl">
					<span>In the book</span>
					<button type="button" className="bk-lnk" onClick={onLocate} title="See this page of the book">
						p.{exercise.page}
						<ArrowUpRight aria-hidden />
					</button>
				</p>
				{crop ? (
					<button
						type="button"
						className="bk-bookcrop"
						onClick={() => onViewCrop({ url: crop, alt: cropAlt })}
						title="See the page's notation at full size"
					>
						{/* A signed, hour-long Storage URL: not a candidate for next/image's loader. */}
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={crop} alt={cropAlt} />
					</button>
				) : (
					<p className="bk-meta">{exercise.crop_path ? "Loading the crop…" : "No crop was kept for this draft."}</p>
				)}
			</div>

			<div>
				<p className="bk-lbl">
					<span>
						As read · {pattern.timeSignature[0]}/{pattern.timeSignature[1]}
					</span>
					<span className="bk-meta" title={`The pattern's own tempo is ${playback.patternBpm}`}>
						{beatUnitGlyph(pattern.timeSignature)} = {playback.bpm}
					</span>
				</p>
				{/* The tab, as the Tab page draws it; the overlays sit over the rows. */}
				<div className="bk-staves">
					<div ref={viewer} data-tab-viewer className="bk-viewer">
						<div ref={measureHighlightRef} aria-hidden className="bk-measure-hl" />
						<div ref={cursorRef} aria-hidden className="bk-playhead" />
						<div className="bk-rows">
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
										renderContext={renderContext}
									/>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</SidePanel>
	);
}

/** The crop's signed URL, null until it arrives (or when there is none). */
function useCrop(path: string | null): string | null {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		if (!path) return;
		let cancelled = false;
		void cropUrl(path).then((next) => {
			if (!cancelled) setUrl(next);
		});
		return () => {
			cancelled = true;
		};
	}, [path]);
	return url;
}
