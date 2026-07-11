"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
	Plus,
	Copy,
	Trash2,
	ArrowLeftToLine,
	ArrowRightToLine,
	X as XIcon,
} from "lucide-react";
import type { Duration, FingerpickPattern, StringFret } from "@/lib/fingerpickTypes";
import {
	makeDefaultPattern,
	clonePatternForEdit,
	setFret,
	setInactive,
	toggleMuted,
	setTechnique,
	moveCell,
	hasPreviousNoteOnString,
	setSlotsDuration,
	insertSlots,
	duplicateSlots,
	deleteSlots,
	addSlotToMeasure,
	addMeasure,
	deleteMeasure,
	STRING_LABELS,
	DURATION_PICKER,
	MAX_FRET,
	type Cell,
	type Direction,
	type SlotTarget,
} from "@/lib/fingerpickEdit";

export interface FingerpickEditModalProps {
	open: boolean;
	pattern: FingerpickPattern | null; // null = new pattern from scratch
	onClose: () => void;
	onSave: (pattern: FingerpickPattern) => void;
}

const TIME_SIGNATURES: { label: string; value: [number, number] }[] = [
	{ label: "4/4", value: [4, 4] },
	{ label: "3/4", value: [3, 4] },
	{ label: "6/8", value: [6, 8] },
];

// Short glyphs shown under each slot column so the current rhythmic value is
// visible in the grid (durations beyond the picker set still get a marker).
const DURATION_ABBREV: Record<Duration, string> = {
	whole: "W",
	half: "H",
	quarter: "Q",
	"dotted-quarter": "Q.",
	eighth: "E",
	"dotted-eighth": "E.",
	"eighth-triplet": "E³",
	sixteenth: "S",
	"sixteenth-triplet": "S³",
	"32nd": "T",
	rest: "R",
};

const TECHNIQUE_OPTIONS: { label: string; value: NonNullable<StringFret["technique"]> }[] = [
	{ label: "Hammer-on (H)", value: "hammer-on" },
	{ label: "Pull-off (P)", value: "pull-off" },
	{ label: "Slide up (↑)", value: "slide-up" },
	{ label: "Slide down (↓)", value: "slide-down" },
];

const TECHNIQUE_GLYPH: Partial<Record<NonNullable<StringFret["technique"]>, string>> = {
	"hammer-on": "h",
	"pull-off": "p",
	"slide-up": "↑",
	"slide-down": "↓",
};

const ARROW_DIRECTIONS: Record<string, Direction> = {
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
};

const MIN_BPM = 40;
const MAX_BPM = 220;

// Desktop dynamic-width geometry (rem). Modal width = cols × (block + gap) + chrome.
const MEASURE_BLOCK_REM = 19; // per-measure block target width
const GRID_GAP_REM = 1; // gap-4 between measure blocks
const MODAL_CHROME_REM = 2; // DialogContent p-4 (left + right)
const TWO_DIGIT_WINDOW_MS = 800;
const LONG_PRESS_MS = 500;

const cellKey = (c: Cell) => `${c.measureIndex}:${c.slotIndex}:${c.stringIndex}`;
const columnKey = (t: SlotTarget) => `${t.measureIndex}:${t.slotIndex}`;
const parseColumnKey = (key: string): SlotTarget => {
	const [m, s] = key.split(":").map(Number);
	return { measureIndex: m, slotIndex: s };
};

function cellDisplay(sf: StringFret): string {
	if (sf.muted) return "x";
	if (sf.fret !== null) return String(sf.fret);
	return "–";
}

export default function FingerpickEditModal({
	open,
	pattern: initialPattern,
	onClose,
	onSave,
}: FingerpickEditModalProps) {
	const [working, setWorking] = useState<FingerpickPattern>(makeDefaultPattern);
	const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
	const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
	const [techMenu, setTechMenu] = useState<{ cell: Cell; x: number; y: number } | null>(null);

	// Latest working pattern for keyboard handlers (avoids stale-closure nav).
	const workingRef = useRef(working);
	// Two-digit fret entry buffer.
	const pendingDigitRef = useRef<{ key: string; digit: number; time: number } | null>(null);
	// Focusable cell buttons, keyed by cellKey.
	const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
	const popupRef = useRef<HTMLDivElement>(null);
	const techMenuRef = useRef<HTMLDivElement>(null);
	// Long-press timer for the mobile technique menu.
	const longPressRef = useRef<number | null>(null);

	// Keep the nav ref pointing at the latest working pattern.
	useEffect(() => {
		workingRef.current = working;
	}, [working]);

	// Clear any pending long-press timer on unmount.
	useEffect(() => {
		return () => {
			if (longPressRef.current !== null) clearTimeout(longPressRef.current);
		};
	}, []);

	// Initialise the working copy whenever the modal opens.
	useEffect(() => {
		if (!open) return;
		queueMicrotask(() => {
			setWorking(initialPattern ? clonePatternForEdit(initialPattern) : makeDefaultPattern());
			setSelectedCell(null);
			setSelectedColumns(new Set());
			setTechMenu(null);
			pendingDigitRef.current = null;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	// Move DOM focus to the selected cell so keyboard navigation stays live.
	useEffect(() => {
		if (!selectedCell) return;
		cellRefs.current.get(cellKey(selectedCell))?.focus();
	}, [selectedCell]);

	// Close popups on any outside pointer press.
	useEffect(() => {
		if (selectedColumns.size === 0 && !techMenu) return;
		function handlePointerDown(e: PointerEvent) {
			const target = e.target as HTMLElement;
			if (techMenu && !techMenuRef.current?.contains(target)) {
				setTechMenu(null);
			}
			if (
				selectedColumns.size > 0 &&
				!popupRef.current?.contains(target) &&
				!target.closest("[data-column-selector]")
			) {
				setSelectedColumns(new Set());
			}
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [selectedColumns, techMenu]);

	// ── Cell keyboard editing ──────────────────────────────────────────────────

	const handleCellKeyDown = useCallback((e: React.KeyboardEvent, cell: Cell) => {
		const key = e.key;
		const dir = ARROW_DIRECTIONS[key];
		if (dir) {
			e.preventDefault();
			setSelectedCell(moveCell(workingRef.current, cell, dir));
			pendingDigitRef.current = null;
			return;
		}
		if (key === "Backspace" || key === "Delete") {
			e.preventDefault();
			setWorking((prev) => setInactive(prev, cell));
			pendingDigitRef.current = null;
			return;
		}
		if (key === "x" || key === "X") {
			e.preventDefault();
			setWorking((prev) => toggleMuted(prev, cell));
			pendingDigitRef.current = null;
			return;
		}
		if (/^[0-9]$/.test(key)) {
			e.preventDefault();
			const digit = Number(key);
			const ck = cellKey(cell);
			const now = Date.now();
			const pend = pendingDigitRef.current;
			if (pend && pend.key === ck && now - pend.time < TWO_DIGIT_WINDOW_MS) {
				const combined = pend.digit * 10 + digit;
				if (combined <= MAX_FRET) {
					setWorking((prev) => setFret(prev, cell, combined));
					pendingDigitRef.current = null;
				} else {
					setWorking((prev) => setFret(prev, cell, digit));
					pendingDigitRef.current = { key: ck, digit, time: now };
				}
			} else {
				setWorking((prev) => setFret(prev, cell, digit));
				pendingDigitRef.current = { key: ck, digit, time: now };
			}
		}
	}, []);

	// ── Technique context menu ───────────────────────────────────────────────

	// Position the menu relative to the (scrollable, transformed) dialog content
	// box so it stays correctly anchored regardless of viewport scroll/transform.
	function openTechMenu(cell: Cell, clientX: number, clientY: number, anchorEl: HTMLElement) {
		const content = anchorEl.closest<HTMLElement>('[data-slot="dialog-content"]');
		if (!content) return;
		const rect = content.getBoundingClientRect();
		setTechMenu({
			cell,
			x: clientX - rect.left + content.scrollLeft,
			y: clientY - rect.top + content.scrollTop,
		});
	}

	function handleCellPointerDown(cell: Cell, e: React.PointerEvent) {
		if (e.pointerType !== "touch") return;
		const x = e.clientX;
		const y = e.clientY;
		const anchorEl = e.currentTarget as HTMLElement;
		longPressRef.current = window.setTimeout(
			() => openTechMenu(cell, x, y, anchorEl),
			LONG_PRESS_MS,
		);
	}

	function cancelLongPress() {
		if (longPressRef.current !== null) {
			clearTimeout(longPressRef.current);
			longPressRef.current = null;
		}
	}

	function applyTechnique(technique: NonNullable<StringFret["technique"]> | null) {
		if (!techMenu) return;
		const cell = techMenu.cell;
		setWorking((prev) => setTechnique(prev, cell, technique));
		setTechMenu(null);
	}

	// ── Column popup actions ─────────────────────────────────────────────────

	const columnTargets = (): SlotTarget[] => [...selectedColumns].map(parseColumnKey);

	function toggleColumn(target: SlotTarget) {
		setSelectedColumns((prev) => {
			const next = new Set(prev);
			const key = columnKey(target);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	function applyDuration(duration: Duration) {
		setWorking((prev) => setSlotsDuration(prev, columnTargets(), duration));
	}

	function applyStructural(op: "before" | "after" | "duplicate" | "delete") {
		const targets = columnTargets();
		setWorking((prev) => {
			if (op === "duplicate") return duplicateSlots(prev, targets);
			if (op === "delete") return deleteSlots(prev, targets);
			return insertSlots(prev, targets, op);
		});
		setSelectedColumns(new Set());
	}

	// Duration highlighted in the picker = the shared value of all selected slots.
	const selectedDuration: Duration | null = (() => {
		const targets = columnTargets();
		if (targets.length === 0) return null;
		const durations = targets.map(
			(t) => working.measures[t.measureIndex]?.slots[t.slotIndex]?.duration,
		);
		const first = durations[0];
		return durations.every((d) => d === first) ? (first ?? null) : null;
	})();

	// The column popup is anchored below the first selected column's selector.
	const firstSelectedColumnKey =
		selectedColumns.size > 0
			? columnKey(
					[...selectedColumns]
						.map(parseColumnKey)
						.sort(
							(a, b) => a.measureIndex - b.measureIndex || a.slotIndex - b.slotIndex,
						)[0],
				)
			: null;

	const columnPopup = (
		<div
			ref={popupRef}
			className="absolute top-full left-0 mt-1.5 z-[60] rounded-lg border border-slate-200 bg-white shadow-lg p-2 flex flex-col gap-2"
		>
			<div className="flex gap-1">
				{DURATION_PICKER.map((d) => (
					<button
						key={d.value}
						onClick={() => applyDuration(d.value)}
						title={d.value}
						className={`h-7 w-7 rounded font-mono text-xs font-semibold transition-colors ${
							selectedDuration === d.value
								? "bg-denim text-white"
								: "text-slate-500 hover:bg-denim-tint"
						}`}
					>
						{d.label}
					</button>
				))}
			</div>
			<div className="flex gap-1 border-t border-slate-100 pt-2">
				<PopupIconButton title="Insert before" onClick={() => applyStructural("before")}>
					<ArrowLeftToLine size={14} />
				</PopupIconButton>
				<PopupIconButton title="Insert after" onClick={() => applyStructural("after")}>
					<ArrowRightToLine size={14} />
				</PopupIconButton>
				<PopupIconButton title="Duplicate" onClick={() => applyStructural("duplicate")}>
					<Copy size={14} />
				</PopupIconButton>
				<PopupIconButton title="Delete" onClick={() => applyStructural("delete")} danger>
					<Trash2 size={14} />
				</PopupIconButton>
			</div>
		</div>
	);

	// ── Metadata edits ────────────────────────────────────────────────────────

	function handleSave() {
		if (!working.name.trim()) return;
		onSave({
			...working,
			name: working.name.trim(),
			bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, working.bpm)),
		});
		onClose();
	}

	const nameValid = working.name.trim().length > 0;

	// Dynamic desktop (lg+) width: grow with measure count, 2 → 4 columns, then
	// stop (extra measures wrap). Below lg the static md:2 / sm:1 layout applies.
	// width = cols × (block + gap) + horizontal chrome (all rem).
	const lgCols = Math.min(Math.max(working.measures.length, 2), 4);
	const modalWidthRem = lgCols * MEASURE_BLOCK_REM + (lgCols - 1) * GRID_GAP_REM + MODAL_CHROME_REM;
	const dynamicStyle = {
		"--fp-w": `${modalWidthRem}rem`,
		"--fp-cols": String(lgCols),
	} as React.CSSProperties;

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				showCloseButton={false}
				style={dynamicStyle}
				className="w-full max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-3xl lg:w-[var(--fp-w)] lg:max-w-[min(var(--fp-w),96vw)] max-h-[90vh] overflow-y-auto"
				onEscapeKeyDown={(e) => {
					if (techMenu || selectedColumns.size > 0) {
						e.preventDefault();
						setTechMenu(null);
						setSelectedColumns(new Set());
					}
				}}
			>
				{/* ── Header ─────────────────────────────────────────────────────── */}
				<div className="flex items-center justify-between">
					<h2 className="font-heading text-base font-medium text-slate-700">
						{initialPattern ? "Edit pattern" : "New pattern"}
					</h2>
					<button
						onClick={onClose}
						aria-label="Close"
						className="h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
					>
						<XIcon size={18} />
					</button>
				</div>

				{/* ── Metadata bar ──────────────────────────────────────────────── */}
				<div className="flex flex-wrap items-end gap-3">
					<div className="flex flex-col gap-1 min-w-40 flex-1">
						<label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							Name
						</label>
						<input
							type="text"
							value={working.name}
							onChange={(e) => setWorking((p) => ({ ...p, name: e.target.value }))}
							placeholder="Pattern name"
							className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-denim/40 ${
								nameValid ? "border-slate-200" : "border-red-300"
							}`}
						/>
					</div>
					<div className="flex flex-col gap-1 w-24">
						<label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							BPM
						</label>
						<input
							type="number"
							min={MIN_BPM}
							max={MAX_BPM}
							value={working.bpm}
							onChange={(e) =>
								setWorking((p) => ({ ...p, bpm: Number(e.target.value) || 0 }))
							}
							className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-denim/40"
						/>
					</div>
					<div className="flex flex-col gap-1 w-24">
						<label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							Time Sig.
						</label>
						<select
							value={`${working.timeSignature[0]}/${working.timeSignature[1]}`}
							onChange={(e) => {
								const ts = TIME_SIGNATURES.find((t) => t.label === e.target.value);
								if (ts) setWorking((p) => ({ ...p, timeSignature: ts.value }));
							}}
							className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-denim/40"
						>
							{TIME_SIGNATURES.map((t) => (
								<option key={t.label} value={t.label}>
									{t.label}
								</option>
							))}
						</select>
					</div>
					<div className="flex flex-col gap-1 min-w-40 flex-1">
						<label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							Description
						</label>
						<input
							type="text"
							value={working.description ?? ""}
							onChange={(e) => setWorking((p) => ({ ...p, description: e.target.value }))}
							placeholder="Optional"
							className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-denim/40"
						/>
					</div>
					<Button
						onClick={handleSave}
						disabled={!nameValid}
						className="h-10 disabled:opacity-40"
						style={{ backgroundColor: "var(--denim)", color: "white" }}
					>
						Save
					</Button>
				</div>

				{/* ── Grid ──────────────────────────────────────────────────────── */}
				{/* sm: 1/row, md: 2/row. At lg+ the column count tracks the measure
				    count (2→4, --fp-cols) in step with the dynamic modal width, so
				    measures fill each row and the extra (add) tile wraps below. */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:[grid-template-columns:repeat(var(--fp-cols),minmax(0,1fr))] gap-4">
					{working.measures.map((measure, measureIndex) => {
						const n = measure.slots.length;
						return (
							<div
								key={measure.id}
								className="rounded-lg border border-slate-200 p-3 flex flex-col gap-2"
							>
								<div className="flex items-center justify-between">
									<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
										Measure {measureIndex + 1}
									</span>
									<button
										onClick={() => setWorking((p) => deleteMeasure(p, measureIndex))}
										disabled={working.measures.length <= 1}
										aria-label="Delete measure"
										title="Delete measure"
										className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
									>
										<XIcon size={12} /> Delete
									</button>
								</div>

								<div
									className="grid gap-0.5 items-center"
									style={{
										// minmax(0, 1fr) lets cells shrink to fit the measure block so a
										// dense measure never overflows its column.
										gridTemplateColumns: `1.25rem repeat(${n}, minmax(0, 1fr))`,
									}}
								>
									{/* String rows */}
									{STRING_LABELS.map((label, stringIndex) => (
										<StringRow
											key={stringIndex}
											label={label}
											stringIndex={stringIndex}
											slots={measure.slots}
											measureIndex={measureIndex}
											selectedCell={selectedCell}
											cellRefs={cellRefs}
											onSelect={setSelectedCell}
											onKeyDown={handleCellKeyDown}
											onPointerDownCell={handleCellPointerDown}
											onPointerUpCell={cancelLongPress}
											onContextMenuCell={openTechMenu}
										/>
									))}

									{/* Duration labels */}
									<div />
									{measure.slots.map((slot) => (
										<div
											key={`d-${slot.id}`}
											className="text-center text-[9px] font-mono text-slate-400 leading-none"
										>
											{DURATION_ABBREV[slot.duration]}
										</div>
									))}

									{/* Column selectors */}
									<div />
									{measure.slots.map((slot, slotIndex) => {
										const key = columnKey({ measureIndex, slotIndex });
										const isSelected = selectedColumns.has(key);
										return (
											<div
												key={`c-${slot.id}`}
												className="relative flex justify-center pt-1"
											>
												<button
													data-column-selector
													onClick={() => toggleColumn({ measureIndex, slotIndex })}
													aria-label={`Select column ${slotIndex + 1}`}
													className={`h-3.5 w-3.5 rounded-full border transition-colors ${
														isSelected
															? "bg-denim border-denim"
															: "border-slate-300 hover:border-denim"
													}`}
												/>
												{key === firstSelectedColumnKey && columnPopup}
											</div>
										);
									})}
								</div>

								<button
									onClick={() => setWorking((p) => addSlotToMeasure(p, measureIndex))}
									className="flex items-center justify-center gap-1 h-7 rounded border border-dashed border-slate-200 text-[11px] text-slate-400 hover:border-denim hover:text-denim transition-colors"
								>
									<Plus size={12} /> Add slot
								</button>
							</div>
						);
					})}

					{/* Add measure block */}
					<button
						onClick={() => setWorking((p) => addMeasure(p))}
						className="rounded-lg border border-dashed border-slate-300 min-h-32 flex items-center justify-center gap-1.5 text-sm text-slate-400 hover:border-denim hover:text-denim transition-colors"
					>
						<Plus size={16} /> Add measure
					</button>
				</div>

				<p className="text-[11px] text-slate-400">
					Click a cell then use arrow keys to move, number keys to set a fret,{" "}
					<span className="font-mono">x</span> to mute, Backspace to clear. Right-click (or
					long-press) a cell for techniques.
				</p>

				{/* ── Technique context menu (absolute within the content box) ───── */}
				{techMenu && (
					<div
						ref={techMenuRef}
						className="absolute z-[60] rounded-lg border border-slate-200 bg-white shadow-lg py-1 min-w-40 text-sm"
						style={{ top: techMenu.y, left: techMenu.x }}
					>
						{TECHNIQUE_OPTIONS.map((opt) => {
							const enabled = hasPreviousNoteOnString(working, techMenu.cell);
							return (
								<button
									key={opt.value}
									disabled={!enabled}
									onClick={() => applyTechnique(opt.value)}
									title={enabled ? undefined : "No previous note on this string"}
									className="w-full text-left px-3 py-1.5 text-slate-600 hover:bg-denim-tint disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
								>
									{opt.label}
								</button>
							);
						})}
						<div className="border-t border-slate-100 my-1" />
						<button
							onClick={() => applyTechnique(null)}
							className="w-full text-left px-3 py-1.5 text-slate-600 hover:bg-denim-tint transition-colors"
						>
							Clear
						</button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StringRow({
	label,
	stringIndex,
	slots,
	measureIndex,
	selectedCell,
	cellRefs,
	onSelect,
	onKeyDown,
	onPointerDownCell,
	onPointerUpCell,
	onContextMenuCell,
}: {
	label: string;
	stringIndex: number;
	slots: import("@/lib/fingerpickTypes").BeatSlot[];
	measureIndex: number;
	selectedCell: Cell | null;
	cellRefs: React.RefObject<Map<string, HTMLButtonElement>>;
	onSelect: (cell: Cell) => void;
	onKeyDown: (e: React.KeyboardEvent, cell: Cell) => void;
	onPointerDownCell: (cell: Cell, e: React.PointerEvent) => void;
	onPointerUpCell: () => void;
	onContextMenuCell: (cell: Cell, x: number, y: number, anchorEl: HTMLElement) => void;
}) {
	return (
		<>
			<div className="text-center text-[10px] font-mono font-semibold text-slate-400">
				{label}
			</div>
			{slots.map((slot, slotIndex) => {
				const cell: Cell = { measureIndex, slotIndex, stringIndex };
				const key = cellKey(cell);
				const sf = slot.strings[stringIndex];
				const isSelected =
					selectedCell != null &&
					selectedCell.measureIndex === measureIndex &&
					selectedCell.slotIndex === slotIndex &&
					selectedCell.stringIndex === stringIndex;
				const glyph = sf.technique ? TECHNIQUE_GLYPH[sf.technique] : undefined;
				return (
					<button
						key={key}
						ref={(el) => {
							if (el) cellRefs.current.set(key, el);
							else cellRefs.current.delete(key);
						}}
						onClick={() => onSelect(cell)}
						onKeyDown={(e) => onKeyDown(e, cell)}
						onPointerDown={(e) => onPointerDownCell(cell, e)}
						onPointerUp={onPointerUpCell}
						onPointerLeave={onPointerUpCell}
						onContextMenu={(e) => {
							e.preventDefault();
							onSelect(cell);
							onContextMenuCell(cell, e.clientX, e.clientY, e.currentTarget);
						}}
						className={`relative h-7 min-w-0 overflow-hidden flex items-center justify-center rounded font-mono text-xs transition-colors ${
							isSelected
								? "bg-denim-tint ring-1 ring-denim text-denim"
								: "hover:bg-slate-50 text-slate-600"
						} ${sf.fret === null && !sf.muted ? "text-slate-300" : ""}`}
					>
						{cellDisplay(sf)}
						{glyph && (
							<span className="absolute top-0 right-0.5 text-[8px] leading-none text-denim">
								{glyph}
							</span>
						)}
					</button>
				);
			})}
		</>
	);
}

function PopupIconButton({
	title,
	onClick,
	children,
	danger,
}: {
	title: string;
	onClick: () => void;
	children: React.ReactNode;
	danger?: boolean;
}) {
	return (
		<button
			onClick={onClick}
			title={title}
			aria-label={title}
			className={`h-7 w-7 flex items-center justify-center rounded text-slate-500 transition-colors ${
				danger ? "hover:bg-red-50 hover:text-red-500" : "hover:bg-denim-tint hover:text-denim"
			}`}
		>
			{children}
		</button>
	);
}
