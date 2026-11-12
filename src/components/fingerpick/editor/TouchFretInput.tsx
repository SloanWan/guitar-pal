"use client";

import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import type { Cell } from "@/lib/fingerpickEdit";
import { readFretEntry } from "@/lib/tabEditorCursor";

/** What the page asks of the box from outside it. */
export interface TouchFretControl {
	/** Writes a first digit still waiting for its second, on the cell it was typed on. */
	flush(): void;
}

interface Props {
	/** Focused by the page inside the tap itself: iOS raises a keyboard only for a focus made in the gesture. */
	ref: Ref<HTMLInputElement>;
	control: Ref<TouchFretControl>;
	/** The tab element the box is laid over; it holds the cursor's cell. */
	sheetRef: RefObject<HTMLElement | null>;
	cursor: Cell;
	open: boolean;
	/** What the box offers before anything is typed: the note there, else the chord shape's fret. */
	placeholder: string;
	/** The fret an empty Done takes, when there is one: the chord shape's. */
	offered: number | null;
	/** Writes at the cursor; `advance` moves it on, as a whole fret typed does. */
	onEnter: (fret: number, advance: boolean) => void;
	onClose: () => void;
}

interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
}

const cellKey = (cell: Cell) => `${cell.measureIndex}:${cell.slotIndex}:${cell.stringIndex}`;

/**
 * A touch screen's way to write a fret (#479): a tap on a cell lays this small
 * box over it and the system's number keyboard comes up. A 0 or a 3–9 is
 * written at once, a 1 or a 2 waits for a second digit or Done; with auto-advance
 * the box follows the cursor, so a run of notes is typed without lifting a finger
 * to the grid again. An x, a link or an effect is a button away in the toolbar
 * and the inspector, as for a mouse.
 *
 * It is always there on a touch screen, hidden until opened, so the page can
 * focus it inside the tap. Its keys stop at it: the tab element's own keys would
 * otherwise read the same digits again. What was typed belongs to the cell it was
 * typed on: the cursor moving on starts the box empty.
 */
export default function TouchFretInput({ ref, control, sheetRef, cursor, open, placeholder, offered, onEnter, onClose }: Props) {
	const key = cellKey(cursor);
	const [typed, setTyped] = useState({ key, text: "" });
	const text = typed.key === key ? typed.text : "";
	const setText = (next: string) => setTyped({ key, text: next });
	const [box, setBox] = useState<Box | null>(null);
	// Set when the box closes itself, so the blur that follows writes nothing.
	const dropped = useRef(false);

	useImperativeHandle(control, () => ({
		flush() {
			const fret = readFretEntry(text).fret;
			setText("");
			if (fret !== null) onEnter(fret, false);
		},
	}));

	// Laid over the cursor's cell, in the tab element's own coordinates, so it scrolls with the grid.
	useLayoutEffect(() => {
		const sheet = sheetRef.current;
		if (!sheet) return;
		const place = () => {
			const cell = sheet.querySelector<HTMLElement>(".te-mb-cell[data-cur]");
			if (!cell) return setBox(null);
			const at = cell.getBoundingClientRect();
			const origin = sheet.getBoundingClientRect();
			setBox({ top: at.top - origin.top, left: at.left - origin.left, width: at.width, height: at.height });
		};
		place();
		const watch = new ResizeObserver(place);
		watch.observe(sheet);
		return () => watch.disconnect();
	}, [sheetRef, key]);

	function enter(raw: string) {
		const entry = readFretEntry(raw);
		if (entry.done && entry.fret !== null) {
			setText("");
			onEnter(entry.fret, true);
			return;
		}
		setText(entry.text);
	}

	/** Done or leaving the box: what was typed is the note; nothing typed takes the offered fret. */
	function finish(close: boolean) {
		const fret = readFretEntry(text).fret ?? offered;
		setText("");
		if (fret !== null) onEnter(fret, true);
		if (close) onClose();
	}

	return (
		<input
			ref={ref}
			className="te-touch-fret"
			data-open={open ? "" : undefined}
			style={box ? { top: box.top, left: box.left, width: box.width, height: box.height } : undefined}
			type="text"
			inputMode="numeric"
			pattern="[0-9]*"
			enterKeyHint="done"
			autoComplete="off"
			aria-label={`Fret for bar ${cursor.measureIndex + 1}, slot ${cursor.slotIndex + 1}`}
			placeholder={placeholder}
			value={text}
			tabIndex={open ? 0 : -1}
			onChange={(e) => enter(e.target.value)}
			onKeyDown={(e) => {
				e.stopPropagation();
				// Closing takes the focus away too, or a hidden box would still take digits.
				const close = () => {
					dropped.current = true;
					setText("");
					onClose();
					e.currentTarget.blur();
				};
				if (e.key === "Enter") {
					e.preventDefault();
					// With nothing to write, Done closes the box.
					if (readFretEntry(text).fret === null && offered === null) close();
					else finish(false);
				} else if (e.key === "Escape") {
					close();
				}
			}}
			onBlur={() => {
				if (dropped.current) {
					dropped.current = false;
					return;
				}
				if (open) finish(true);
			}}
		/>
	);
}
