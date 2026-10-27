"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { BarChordDiagram } from "@/components/strum/useBarChordDiagrams";
import type { ProgressionDraft } from "@/components/strum/useProgressionDraft";
import { cssPx, useElementWidth } from "@/components/strum/useElementWidth";
import { STRUM_CAPO_MAX, type ChordProgression } from "@/lib/strumPatterns";
import { barPlaceholder } from "@/lib/strumBars";
import { barLabel, defaultProgressionName, progressionCapo, progressionDisplayName } from "@/lib/strumProgressions";
import { balancedPerRow } from "@/lib/balancedRows";
import { prefersReducedMotion } from "@/lib/motion";
import ChordTile from "./ChordTile";

/** How the open progression's chords are shown: a chart line of names, or a tile each with its shape. */
export type ChordView = "names" | "shapes";

/** A question waiting on the open progression's unsaved changes. */
export interface PendingSwitch {
	/** What is about to open, as the question names it. */
	label: string;
	onKeepEditing: () => void;
	onDiscard: () => void;
	onSave: () => void;
}

interface Props {
	/** The open progression, edits applied. */
	progression: ChordProgression;
	draft: ProgressionDraft;
	readOnly: boolean;
	/** The bar sounding now, while playing. */
	playingBar: number | null;
	diagrams: (BarChordDiagram | null)[];
	view: ChordView;
	onView: (view: ChordView) => void;
	/** Keep the sounding chord in view, scrolling the chords — never the page. */
	follow: boolean;
	onFollow: (follow: boolean) => void;
	onEditBar: (index: number) => void;
	onAddBar: () => void;
	onSave: () => void;
	onSaveAsNew: () => void;
	onDelete: () => void;
	pendingSwitch: PendingSwitch | null;
}

const VIEWS: { value: ChordView; label: string }[] = [
	{ value: "names", label: "Names" },
	{ value: "shapes", label: "Shapes" },
];

/**
 * The open progression: its name and capo, its chords — a chart line or a tile
 * each — and what to do with changes. A chord opens the chord sheet; nothing is
 * written until Save. The chords scroll inside the panel, so the stage above
 * them stays where it is.
 */
export default function ProgressionEditor({
	progression,
	draft,
	readOnly,
	playingBar,
	diagrams,
	view,
	onView,
	follow,
	onFollow,
	onEditBar,
	onAddBar,
	onSave,
	onSaveAsNew,
	onDelete,
	pendingSwitch,
}: Props) {
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [measure, width, scroller] = useElementWidth<HTMLDivElement>();
	const capo = progressionCapo(progression);
	const bars = progression.bars;

	// One row when the chords fit on one (tiles may narrow to --st-tile-min for it);
	// otherwise rows as even as they can be. Only the chords count: "Add chord"
	// follows them, into the last row's gap or onto a row of its own.
	const per =
		view === "shapes"
			? balancedPerRow(bars.length, width, cssPx(scroller, "--st-tile-min"), cssPx(scroller, "--st-tile-gap"), cssPx(scroller, "--st-tile-max") || Infinity)
			: balancedPerRow(bars.length, width, cssPx(scroller, "--st-cl-cell"), 0, cssPx(scroller, "--st-cl-max") || Infinity);
	const columns = { "--per": String(Math.max(1, per)) } as CSSProperties;

	// The sounding chord's row is the first one shown, so what comes next is below it:
	// the chords scroll, the page does not. The last rows stop where the list ends.
	useEffect(() => {
		if (!follow || playingBar === null || !scroller) return;
		const el = scroller.querySelector<HTMLElement>(`[data-bar="${playingBar}"]`);
		if (!el) return;
		const top = Math.max(0, el.offsetTop - cssPx(scroller, "padding-top"));
		if (Math.abs(scroller.scrollTop - top) < 1) return;
		scroller.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
	}, [follow, playingBar, scroller, view, per]);

	return (
		<div className="st-editor">
			<div className="st-editor-head">
				{readOnly ? (
					<h3 className="st-editor-name">{progressionDisplayName(progression)}</h3>
				) : (
					<input
						className="st-title-in"
						aria-label="Progression name"
						placeholder={defaultProgressionName(bars)}
						value={progression.name ?? ""}
						onChange={(e) => draft.setName(e.target.value)}
					/>
				)}
				{readOnly ? (
					capo > 0 && <span className="st-lab">Capo {capo}</span>
				) : (
					<span className="st-capo" role="group" aria-label="Capo">
						<span className="st-lab">Capo</span>
						<Button variant="icon" size="xs" aria-label="Capo down" disabled={capo <= 0} onClick={() => draft.setCapo(capo - 1)}>
							−
						</Button>
						<output className="st-num st-capo-val">{capo === 0 ? "—" : capo}</output>
						<Button variant="icon" size="xs" aria-label="Capo up" disabled={capo >= STRUM_CAPO_MAX} onClick={() => draft.setCapo(capo + 1)}>
							+
						</Button>
					</span>
				)}
				{!readOnly && (
					<button
						type="button"
						className="st-icon"
						data-tone="bad"
						data-anim="delete"
						aria-expanded={confirmDelete}
						aria-label="Delete this progression"
						title="Delete this progression"
						onClick={() => setConfirmDelete((v) => !v)}
					>
						<Trash2 aria-hidden />
					</button>
				)}
			</div>

			{confirmDelete && (
				<div className="st-note" role="alertdialog" aria-label="Delete progression">
					<span className="flex-1 text-[13px]">
						Delete <b>{progressionDisplayName(progression)}</b>? This can&apos;t be undone.
					</span>
					<Button variant="ghost" size="xs" onClick={() => setConfirmDelete(false)}>
						Cancel
					</Button>
					<Button
						variant="danger"
						size="xs"
						onClick={() => {
							setConfirmDelete(false);
							onDelete();
						}}
					>
						Delete
					</Button>
				</div>
			)}

			<div className="st-editor-tools">
				<Segmented label="Chord view" dense options={VIEWS} value={view} onChange={onView} />
				<Switch checked={follow} onCheckedChange={onFollow} label="Follow playback" />
			</div>

			{pendingSwitch ? (
				<div className="st-note" role="alertdialog" aria-label="Unsaved progression">
					<span className="flex-1 text-[13px]">
						Save changes before opening <b>{pendingSwitch.label}</b>?
					</span>
					<Button variant="ghost" size="xs" onClick={pendingSwitch.onKeepEditing}>
						Keep editing
					</Button>
					<Button variant="secondary" size="xs" onClick={pendingSwitch.onDiscard}>
						Discard
					</Button>
					<Button size="xs" onClick={pendingSwitch.onSave}>
						Save
					</Button>
				</div>
			) : (
				draft.dirty && (
					<div className="st-note" role="status">
						<span className="flex-1 text-[13px] font-semibold">You changed this progression</span>
						<Button variant="ghost" size="xs" onClick={draft.revert}>
							Revert
						</Button>
						<Button variant="secondary" size="xs" onClick={onSaveAsNew}>
							Save as new
						</Button>
						<Button size="xs" onClick={onSave}>
							Save
						</Button>
					</div>
				)
			)}

			<div ref={measure} className="st-chords-scroll">
				{view === "shapes" ? (
					<div className="st-tiles" style={columns}>
						{bars.map((bar, i) => (
							<ChordTile
								key={i}
								index={i}
								label={barLabel(bar)}
								diagram={diagrams[i] ?? null}
								now={playingBar === i}
								silent={barPlaceholder(bar) !== null}
								onOpen={readOnly ? undefined : () => onEditBar(i)}
							/>
						))}
						{!readOnly && (
							<button type="button" className="st-tile" data-add onClick={onAddBar}>
								<Plus aria-hidden />
								<span className="text-xs font-semibold">Add chord</span>
							</button>
						)}
					</div>
				) : (
					<div className="st-chordline" style={columns} role="list" aria-label="Chords, one a bar">
						{bars.map((bar, i) => {
							const label = barLabel(bar);
							const props = {
								className: "st-cl-cell",
								"data-bar": i,
								"data-now": playingBar === i ? "" : undefined,
								"data-silent": barPlaceholder(bar) !== null ? "" : undefined,
								"data-end": (i + 1) % Math.max(1, per) === 0 || i === bars.length - 1 ? "" : undefined,
							};
							return (
								<span key={i} role="listitem" className="contents">
									{readOnly ? (
										<span {...props}>{label}</span>
									) : (
										<button type="button" {...props} aria-label={`Bar ${i + 1}: ${label}. Change`} onClick={() => onEditBar(i)}>
											{label}
										</button>
									)}
								</span>
							);
						})}
					</div>
				)}
				{view === "names" && !readOnly && (
					<Button variant="ghost" size="xs" className="mt-2" onClick={onAddBar}>
						<Plus aria-hidden />
						Add chord
					</Button>
				)}
			</div>

		</div>
	);
}
