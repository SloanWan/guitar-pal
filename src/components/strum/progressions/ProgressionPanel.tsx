"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListMusic, Plus, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BarChordDiagram } from "@/components/strum/useBarChordDiagrams";
import type { ProgressionDraft } from "@/components/strum/useProgressionDraft";
import ChordSheet from "@/components/strum/chords/ChordSheet";
import type { ChordProgression } from "@/lib/strumPatterns";
import { getChordIndex } from "@/lib/chords";
import type { ProgressionPreset } from "@/lib/strumProgressionPresets";
import { barLabel, parseChordSequence, progressionCapo, progressionDisplayName, type ChordToken } from "@/lib/strumProgressions";
import { chordIndexWithUser, type UserChordVoicing } from "@/lib/userChordVoicings";
import { prefersReducedMotion } from "@/lib/motion";
import ChordLineComposer from "./ChordLineComposer";
import PresetSheet from "./PresetSheet";
import ProgressionEditor, { type ChordView, type PendingSwitch } from "./ProgressionEditor";

/** Per-viewer: how the open progression's chords are shown, and whether the view follows the playhead. */
const VIEW_KEY = "strumProgressionView";
const FOLLOW_KEY = "strumProgressionFollow";

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
	onCreate: (tokens: ChordToken[], name?: string) => void;
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
 * open one has changes asks first. A new one starts from a preset or a typed line.
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
	const [typing, setTyping] = useState(false);
	const [presetsOpen, setPresetsOpen] = useState(false);
	const [listOpen, setListOpen] = useState(false);
	const [pending, setPending] = useState<{ label: string; run: () => void } | null>(null);
	const [sheetBar, setSheetBar] = useState<number | null>(null);
	const [view, setView] = useState<ChordView>("shapes");
	const [follow, setFollow] = useState(true);
	const open = draft.progression;
	const listRef = useRef<HTMLDivElement>(null);
	const openId = open?.id ?? null;

	// The chosen item is always in view in the list — a new one, a copy saved as new
	// or one restored on arrival lands at the end. Only the list scrolls, never the page.
	useEffect(() => {
		const list = listRef.current;
		const row = list?.querySelector<HTMLElement>('[aria-selected="true"]');
		if (!list || !row) return;
		const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
		const bottom = top + row.offsetHeight;
		if (top >= list.scrollTop && bottom <= list.scrollTop + list.clientHeight) return;
		list.scrollTo({ top: Math.max(0, top - 8), behavior: prefersReducedMotion() ? "auto" : "smooth" });
	}, [openId, progressions.length, listOpen]);

	useEffect(() => {
		try {
			const savedView = localStorage.getItem(VIEW_KEY);
			const savedFollow = localStorage.getItem(FOLLOW_KEY);
			queueMicrotask(() => {
				if (savedView === "names" || savedView === "shapes") setView(savedView);
				if (savedFollow === "0") setFollow(false);
			});
		} catch {
			// unreadable storage: the defaults stand
		}
	}, []);
	function remember(key: string, value: string) {
		try {
			localStorage.setItem(key, value);
		} catch {
			// remembered for this visit only
		}
	}

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

	async function createFromPreset(preset: ProgressionPreset) {
		setPresetsOpen(false);
		try {
			const index = chordIndexWithUser(await getChordIndex(), userVoicings);
			const { tokens } = parseChordSequence(preset.chords, index);
			const chords = tokens.filter((t) => t.chord !== null);
			if (chords.length > 0) guard(preset.name, () => onCreate(chords, preset.name));
		} catch (e) {
			console.error("[ProgressionPanel] preset:", e);
		}
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

	return (
		<section className="st-prog" aria-label="Progressions" data-list={listOpen || typing ? "open" : undefined}>
			<div className="st-prog-head">
				<h2 className="st-prog-title">Progressions</h2>
				<Button
					variant="secondary"
					size="xs"
					className="st-prog-picker"
					aria-expanded={listOpen}
					onClick={() => {
						setListOpen((v) => !v);
						setTyping(false);
					}}
				>
					{progressions.length} progression{progressions.length === 1 ? "" : "s"}
					<ChevronDown aria-hidden />
				</Button>
				{!readOnly && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="secondary" size="xs" aria-label="Add progression">
								<Plus aria-hidden />
								Add
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" data-m="strum">
							<DropdownMenuItem onSelect={() => setPresetsOpen(true)}>
								<ListMusic aria-hidden />
								Start from a preset
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={() => {
									setTyping(true);
									setListOpen(false);
								}}
							>
								<Type aria-hidden />
								Type chords
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			<div ref={listRef} className="st-plist" role="listbox" aria-label="Saved progressions">
				{typing && (
					<ChordLineComposer
						userVoicings={userVoicings}
						onCancel={() => setTyping(false)}
						onCreate={(tokens) => {
							setTyping(false);
							guard("the new progression", () => onCreate(tokens));
						}}
					/>
				)}
				<ListRow
					role="option"
					aria-selected={open === null}
					selected={open === null}
					title="Just the rhythm"
					subline="No chords — the default voicing"
					onClick={() => pick(null)}
				/>
				{progressions.map((p) => {
					const shown = p.id === open?.id ? open : p;
					return (
						<ListRow
							key={p.id}
							role="option"
							aria-selected={p.id === open?.id}
							selected={p.id === open?.id}
							title={progressionDisplayName(shown)}
							subline={itemLine(shown)}
							onClick={() => pick(p.id)}
						/>
					);
				})}
			</div>
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
						view={view}
						onView={(next) => {
							setView(next);
							remember(VIEW_KEY, next);
						}}
						follow={follow}
						onFollow={(next) => {
							setFollow(next);
							remember(FOLLOW_KEY, next ? "1" : "0");
						}}
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
								: "Start from a preset or type a chord line — one chord a bar — to play it over this rhythm."}
						</p>
						{!readOnly && !typing && (
							<span className="flex flex-wrap gap-2">
								<Button size="xs" onClick={() => setPresetsOpen(true)}>
									<ListMusic aria-hidden />
									Start from a preset
								</Button>
								<Button
									variant="secondary"
									size="xs"
									onClick={() => {
										setTyping(true);
										setListOpen(false);
									}}
								>
									<Type aria-hidden />
									Type chords
								</Button>
							</span>
						)}
					</div>
				)}
			</div>
			{!readOnly && (
				<PresetSheet open={presetsOpen} onOpenChange={setPresetsOpen} onPick={(preset) => void createFromPreset(preset)} />
			)}
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
