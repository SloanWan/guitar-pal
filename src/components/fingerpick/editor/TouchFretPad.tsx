"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { STRING_LABELS, type Cell } from "@/lib/fingerpickEdit";
import { pressFretPad, readFretEntry, type FretPadKey } from "@/lib/tabEditorCursor";
import type { TouchFretControl } from "./TouchFretInput";

interface Props {
	control: Ref<TouchFretControl>;
	/** The tab element the keypad is laid over; it holds the cursor's cell. */
	sheetRef: RefObject<HTMLElement | null>;
	cursor: Cell;
	/** What the keypad shows before anything is typed: the note there, else the chord shape's fret. */
	placeholder: string;
	/** The fret an empty Done takes, when there is one: the chord shape's. */
	offered: number | null;
	/** Writes at the cursor; `advance` moves it on, as a whole fret typed does. */
	onEnter: (fret: number, advance: boolean) => void;
	/** Clears the note at the cursor. */
	onClear: () => void;
	onClose: () => void;
}

// Two rows, so the keypad stays short: an iPad on its side with the dock open shows the grid ~300px tall.
const KEYS: readonly FretPadKey[] = [1, 2, 3, 4, 5, "back", 6, 7, 8, 9, 0, "done"];
const GAP_PX = 6;
const cellKey = (cell: Cell) => `${cell.measureIndex}:${cell.slotIndex}:${cell.stringIndex}`;

/**
 * A tablet's way to write a fret (#487): an iPad has no number pad — a numeric
 * field raises its whole keyboard — so a tap on a cell opens this keypad of our
 * own beside the cell instead, and no system keyboard comes up at all. Focus
 * stays on the tab element (the keys never take it), so a hardware keyboard keeps
 * typing as with a mouse. The entry rule is `pressFretPad`'s; with auto-advance
 * the keypad follows the cursor. A tap outside it and the grid's cells closes it.
 * Mounted only while open, and hidden until it is placed.
 * Phones keep the system's number pad (`TouchFretInput`).
 */
export default function TouchFretPad({ control, sheetRef, cursor, placeholder, offered, onEnter, onClear, onClose }: Props) {
	const key = cellKey(cursor);
	const [typed, setTyped] = useState({ key, text: "" });
	const text = typed.key === key ? typed.text : "";
	const setText = (next: string) => setTyped({ key, text: next });
	const padRef = useRef<HTMLDivElement>(null);

	useImperativeHandle(control, () => ({
		flush() {
			const fret = readFretEntry(text).fret;
			setText("");
			if (fret !== null) onEnter(fret, false);
		},
	}));

	// Under the cursor's cell, in the tab element's own coordinates so it scrolls with the grid,
	// never past the sides; the stage scrolls just enough to show it whole (over the cell it would
	// meet the sticky toolbar, under it the dock). Placing it is layout, not state: it is written
	// straight onto the element, shown only once placed (a hidden element is not scrolled to).
	useLayoutEffect(() => {
		const sheet = sheetRef.current;
		const pad = padRef.current;
		if (!sheet || !pad) return;
		const place = () => {
			const cell = sheet.querySelector<HTMLElement>(".te-mb-cell[data-cur]");
			if (!cell) return false;
			const c = cell.getBoundingClientRect();
			const origin = sheet.getBoundingClientRect();
			const centred = c.left + c.width / 2 - pad.offsetWidth / 2 - origin.left;
			pad.style.top = `${c.bottom + GAP_PX - origin.top}px`;
			pad.style.left = `${Math.max(0, Math.min(centred, origin.width - pad.offsetWidth))}px`;
			pad.dataset.placed = "";
			return true;
		};
		if (place()) pad.scrollIntoView({ block: "nearest", inline: "nearest" });
		const watch = new ResizeObserver(() => place());
		watch.observe(sheet);
		return () => watch.disconnect();
	}, [sheetRef, key]);

	// A tap anywhere but the keypad or a cell (which moves it) puts it away, the waiting digit written.
	const outside = useRef(() => {});
	useEffect(() => {
		outside.current = () => {
			const fret = readFretEntry(text).fret;
			if (fret !== null) onEnter(fret, false);
			onClose();
		};
	});
	useEffect(() => {
		const down = (e: PointerEvent) => {
			const target = e.target as Element | null;
			if (target?.closest(".te-pad, .te-mb-cell")) return;
			outside.current();
		};
		document.addEventListener("pointerdown", down, true);
		return () => document.removeEventListener("pointerdown", down, true);
	}, []);

	function press(k: FretPadKey) {
		const result = pressFretPad(text, k, offered);
		setText(result.text);
		if (result.write) onEnter(result.write.fret, result.write.advance);
		if (result.clear) onClear();
		if (result.close) onClose();
	}

	const where = `${STRING_LABELS[cursor.stringIndex]} string, bar ${cursor.measureIndex + 1}, slot ${cursor.slotIndex + 1}`;
	return (
		<div
			ref={padRef}
			className="te-pad"
			role="group"
			aria-label={`Fret keypad: ${where}`}
			// The keys never take focus: the tab element keeps it, and no keyboard comes up.
			onMouseDown={(e) => e.preventDefault()}
		>
			<div className="te-pad-head">
				<span className="te-pad-where">{where}</span>
				<output className="te-pad-value" aria-label="Typed fret" data-empty={text === "" ? "" : undefined}>
					{text || placeholder || "–"}
				</output>
			</div>
			<div className="te-pad-keys">
				{KEYS.map((k) =>
					k === "back" ? (
						<Button key={k} variant="secondary" className="te-pad-key" aria-label={text ? "Delete digit" : "Clear note"} onClick={() => press(k)}>
							⌫
						</Button>
					) : k === "done" ? (
						<Button key={k} variant="primary" className="te-pad-key" aria-label={text === "" && offered !== null ? `Done, fret ${offered}` : "Done"} onClick={() => press(k)}>
							✓{text === "" && offered !== null && <small className="te-pad-offer">{offered}</small>}
						</Button>
					) : (
						<Button key={k} variant="secondary" className="te-pad-key" onClick={() => press(k)}>
							{k}
						</Button>
					),
				)}
			</div>
		</div>
	);
}
