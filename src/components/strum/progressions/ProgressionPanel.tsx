"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BarChordDiagram } from "@/components/strum/useBarChordDiagrams";
import type { ProgressionDraft } from "@/components/strum/useProgressionDraft";
import ChordSheet from "@/components/strum/chords/ChordSheet";
import type { ChordProgression } from "@/lib/strumPatterns";
import { barLabel, progressionCapo, progressionDisplayName, type ChordToken } from "@/lib/strumProgressions";
import type { UserChordVoicing } from "@/lib/userChordVoicings";
import ChordLineComposer from "./ChordLineComposer";
import ProgressionEditor, { type PendingSwitch } from "./ProgressionEditor";

interface Props {
	patternName: string;
	/** The pattern's progressions as saved, in order. */
	progressions: ChordProgression[];
	draft: ProgressionDraft;
	loading: boolean;
	readOnly: boolean;
	playingBar: number | null;
	diagrams: (BarChordDiagram | null)[];
	userVoicings: readonly UserChordVoicing[];
	onSaveVoicing: (voicing: UserChordVoicing) => UserChordVoicing;
	onOpen: (id: string | null) => void;
	onCreate: (tokens: ChordToken[]) => void;
	onSave: (progression: ChordProgression) => void;
	onSaveAsNew: (progression: ChordProgression) => void;
	onDelete: (progression: ChordProgression) => void;
}

/** "C G Am F · capo 2" — what an item says under its name. */
function itemLine(progression: ChordProgression): string {
	const chords = progression.bars.map(barLabel).join(" ");
	const capo = progressionCapo(progression);
	const parts = progression.name?.trim() ? [chords] : [];
	if (capo > 0) parts.push(`capo ${capo}`);
	return parts.join(" · ") || `${progression.bars.length} bar${progression.bars.length === 1 ? "" : "s"}`;
}

/**
 * The progressions over the open pattern: a list beside the editor of the open
 * one (above it on a phone, folded behind a picker). Opening another while the
 * open one has changes asks first.
 */
export default function ProgressionPanel({
	patternName,
	progressions,
	draft,
	loading,
	readOnly,
	playingBar,
	diagrams,
	userVoicings,
	onSaveVoicing,
	onOpen,
	onCreate,
	onSave,
	onSaveAsNew,
	onDelete,
}: Props) {
	const [adding, setAdding] = useState(false);
	const [listOpen, setListOpen] = useState(false);
	const [pending, setPending] = useState<{ label: string; run: () => void } | null>(null);
	const [sheetBar, setSheetBar] = useState<number | null>(null);
	const open = draft.progression;

	/** Run `action` now, or once the open progression's changes are saved or let go. */
	function guard(label: string, action: () => void) {
		if (draft.dirty) setPending({ label, run: action });
		else action();
	}

	function pick(id: string | null) {
		setListOpen(false);
		if (id === (open?.id ?? null)) return;
		const target = progressions.find((p) => p.id === id);
		guard(target ? progressionDisplayName(target) : "the rhythm alone", () => onOpen(id));
	}

	const pendingSwitch: PendingSwitch | null = pending && {
		label: pending.label,
		onKeepEditing: () => setPending(null),
		onDiscard: () => {
			draft.revert();
			setPending(null);
			pending.run();
		},
		onSave: () => {
			if (open) onSave(open);
			setPending(null);
			pending.run();
		},
	};

	const items = (
		<div className="st-plist" role="listbox" aria-label="Saved progressions">
			{adding && (
				<ChordLineComposer
					userVoicings={userVoicings}
					onCancel={() => setAdding(false)}
					onCreate={(tokens) => {
						setAdding(false);
						guard("the new progression", () => onCreate(tokens));
					}}
				/>
			)}
			<button
				type="button"
				role="option"
				className="st-pitem"
				aria-selected={open === null}
				aria-current={open === null ? "true" : undefined}
				onClick={() => pick(null)}
			>
				<span className="st-pitem-name">Just the rhythm</span>
				<span className="st-lab">No chords — the default voicing</span>
			</button>
			{progressions.map((p) => (
				<button
					key={p.id}
					type="button"
					role="option"
					className="st-pitem"
					aria-selected={p.id === open?.id}
					aria-current={p.id === open?.id ? "true" : undefined}
					onClick={() => pick(p.id)}
				>
					<span className="st-pitem-name">{progressionDisplayName(p.id === open?.id ? open : p)}</span>
					<span className="st-lab">{itemLine(p.id === open?.id ? open : p)}</span>
				</button>
			))}
		</div>
	);

	return (
		<section className="st-prog" aria-label="Progressions" data-list={listOpen || adding ? "open" : undefined}>
			<div className="st-prog-head">
				<h2 className="st-prog-title">Progressions</h2>
				<Button
					variant="secondary"
					size="xs"
					className="st-prog-picker"
					aria-expanded={listOpen}
					onClick={() => {
						setListOpen((v) => !v);
						setAdding(false);
					}}
				>
					{progressions.length} progression{progressions.length === 1 ? "" : "s"}
					<ChevronDown aria-hidden />
				</Button>
				{!readOnly && (
					<Button
						variant="secondary"
						size="xs"
						aria-expanded={adding}
						aria-label="Add progression"
						onClick={() => {
							setAdding((v) => !v);
							setListOpen(false);
						}}
					>
						<Plus aria-hidden />
						Add
					</Button>
				)}
			</div>
			{items}
			<div className="st-prog-main">
				{loading ? (
					<p className="st-lab">Loading progressions…</p>
				) : open ? (
					<ProgressionEditor
						progression={open}
						draft={draft}
						readOnly={readOnly}
						playingBar={playingBar}
						diagrams={diagrams}
						onEditBar={setSheetBar}
						onAddBar={() => setSheetBar(draft.addBar())}
						onSave={() => onSave(open)}
						onSaveAsNew={() => onSaveAsNew(open)}
						onDelete={() => onDelete(open)}
						pendingSwitch={pendingSwitch}
					/>
				) : (
					<div className="st-empty">
						<p className="m-0 text-sm font-semibold">
							{progressions.length === 0 ? `No progressions over ${patternName} yet.` : "Playing the rhythm alone."}
						</p>
						<p className="st-lab m-0">
							{readOnly
								? "Pick a progression to hear its chords."
								: "Add a chord line — one chord a bar — to play it over this rhythm."}
						</p>
						{!readOnly && !adding && (
							<Button
								size="xs"
								onClick={() => {
									setAdding(true);
									setListOpen(false);
								}}
							>
								<Plus aria-hidden />
								Add a progression
							</Button>
						)}
					</div>
				)}
			</div>
			{!readOnly && open && (
				<ChordSheet
					barIndex={sheetBar}
					bars={open.bars}
					userVoicings={userVoicings}
					onSaveVoicing={onSaveVoicing}
					onApply={draft.applyChord}
					onRemove={draft.removeBar}
					onClose={() => setSheetBar(null)}
				/>
			)}
		</section>
	);
}
