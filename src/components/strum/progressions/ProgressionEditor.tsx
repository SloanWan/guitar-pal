"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import type { BarChordDiagram } from "@/components/strum/useBarChordDiagrams";
import type { ProgressionDraft } from "@/components/strum/useProgressionDraft";
import { STRUM_CAPO_MAX, type ChordProgression } from "@/lib/strumPatterns";
import { barPlaceholder } from "@/lib/strumBars";
import { barLabel, defaultProgressionName, progressionCapo, progressionDisplayName } from "@/lib/strumProgressions";
import { prefersReducedMotion } from "@/lib/motion";
import ChordTile from "./ChordTile";

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
	onEditBar: (index: number) => void;
	onAddBar: () => void;
	onSave: () => void;
	onSaveAsNew: () => void;
	onDelete: () => void;
	pendingSwitch: PendingSwitch | null;
}

/**
 * The open progression: its name and capo, a tile a bar, and what to do with
 * changes. A tile opens the chord sheet; nothing is written until Save.
 */
export default function ProgressionEditor({
	progression,
	draft,
	readOnly,
	playingBar,
	diagrams,
	onEditBar,
	onAddBar,
	onSave,
	onSaveAsNew,
	onDelete,
	pendingSwitch,
}: Props) {
	const [confirmDelete, setConfirmDelete] = useState(false);
	const tiles = useRef<(HTMLButtonElement | null)[]>([]);
	const capo = progressionCapo(progression);

	// The bar sounding stays in view, however long the progression runs.
	useEffect(() => {
		if (playingBar === null) return;
		tiles.current[playingBar]?.scrollIntoView({
			block: "nearest",
			behavior: prefersReducedMotion() ? "auto" : "smooth",
		});
	}, [playingBar]);

	return (
		<div className="st-editor">
			<div className="flex flex-wrap items-center gap-2">
				{readOnly ? (
					<h3 className="m-0 flex-1 text-lg font-extrabold">{progressionDisplayName(progression)}</h3>
				) : (
					<input
						className="st-title-in"
						aria-label="Progression name"
						placeholder={defaultProgressionName(progression.bars)}
						value={progression.name ?? ""}
						onChange={(e) => draft.setName(e.target.value)}
					/>
				)}
				{readOnly ? (
					capo > 0 && <span className="st-lab">Capo {capo}</span>
				) : (
					<span className="flex items-center gap-2">
						<span className="st-lab">Capo</span>
						<Stepper label="Capo" value={capo} onChange={draft.setCapo} min={0} max={STRUM_CAPO_MAX} />
					</span>
				)}
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

			<div className="st-tiles">
				{progression.bars.map((bar, i) => (
					<ChordTile
						key={i}
						ref={(el) => {
							tiles.current[i] = el;
						}}
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

			{!readOnly && (
				<div className="st-editor-foot">
					{confirmDelete && (
						<div className="st-note" role="alertdialog" aria-label="Delete progression">
							<span className="text-[13px]">
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
					<button
						type="button"
						className="st-icon"
						data-tone="bad"
						aria-expanded={confirmDelete}
						aria-label="Delete this progression"
						title="Delete this progression"
						onClick={() => setConfirmDelete((v) => !v)}
					>
						<Trash2 aria-hidden />
					</button>
				</div>
			)}
		</div>
	);
}
