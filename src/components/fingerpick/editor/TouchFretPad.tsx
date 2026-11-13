"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, Delete, GripHorizontal, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STRING_LABELS, type Cell } from "@/lib/fingerpickEdit";
import { pressFretPad, readFretEntry, type FretPadKey } from "@/lib/tabEditorCursor";
import type { TouchFretControl } from "./TouchFretInput";

/** Where a dragged keypad was left: its top-left corner, in the viewport's coordinates. */
export interface FretPadPin {
	x: number;
	y: number;
}

interface Props {
	control: Ref<TouchFretControl>;
	/** The tab element the keypad is laid over; it holds the cursor's cell. */
	sheetRef: RefObject<HTMLElement | null>;
	cursor: Cell;
	/** The fret an empty Done takes, when there is one: the chord shape's. */
	offered: number | null;
	/** Where the player left the keypad; null, it sits under the cursor's cell. */
	pin: FretPadPin | null;
	/**
	 * What a pinned keypad is drawn in: the editor page, which never scrolls. The tab element
	 * can't hold it — it scrolls with the stage, and a transform (its rise) makes it the block
	 * a fixed child is placed against.
	 */
	layer: HTMLElement | null;
	onPin: (pin: FretPadPin | null) => void;
	/** Writes at the cursor; `advance` moves it on, as a whole fret typed does. */
	onEnter: (fret: number, advance: boolean) => void;
	/** Clears the note at the cursor. */
	onClear: () => void;
	onClose: () => void;
}

// Two rows, so the keypad stays short: an iPad on its side with the dock open shows the grid ~300px tall.
const KEYS: readonly FretPadKey[] = [1, 2, 3, 4, 5, "back", 6, 7, 8, 9, 0, "done"];
const GAP_PX = 6;
/** How far a dragged keypad keeps from the edges of the editor. */
const EDGE_PX = 8;
const cellKey = (cell: Cell) => `${cell.measureIndex}:${cell.slotIndex}:${cell.stringIndex}`;

/** Keeps a pinned keypad whole inside the editor page (below the header) and the window. */
function clampPin(pin: FretPadPin, pad: HTMLElement): FretPadPin {
	const box = (pad.closest(".te-page") ?? document.documentElement).getBoundingClientRect();
	const maxX = Math.min(box.right, window.innerWidth) - pad.offsetWidth - EDGE_PX;
	const maxY = Math.min(box.bottom, window.innerHeight) - pad.offsetHeight - EDGE_PX;
	return {
		x: Math.max(box.left + EDGE_PX, Math.min(pin.x, maxX)),
		y: Math.max(box.top + EDGE_PX, Math.min(pin.y, maxY)),
	};
}

/**
 * Writes a pinned keypad's place. A fixed element is placed against its containing block,
 * which a container query's containment moves off the viewport (`.te-page` is one), so the
 * block's corner is read from where `0, 0` puts the keypad.
 */
function placePinned(pad: HTMLElement, pin: FretPadPin): void {
	pad.dataset.pinned = "";
	pad.style.left = "0px";
	pad.style.top = "0px";
	const origin = pad.getBoundingClientRect();
	const at = clampPin(pin, pad);
	pad.style.left = `${at.x - origin.left}px`;
	pad.style.top = `${at.y - origin.top}px`;
}

/**
 * A tablet's way to write a fret (#487): an iPad has no number pad — a numeric
 * field raises its whole keyboard — so a tap on a cell opens this keypad of our
 * own instead, and no system keyboard comes up at all. Focus stays on the tab
 * element (the keys never take it), so a hardware keyboard keeps typing as with a
 * mouse. The entry rule is `pressFretPad`'s, and what is typed shows in the
 * cursor's cell itself; with auto-advance the keypad follows the cursor.
 *
 * It opens under the cursor's cell. Dragged by its head it stays where it was left,
 * whatever cell is tapped, so a column can be filled without putting it away; the
 * head's locate key brings it back under the cell. A tap outside it and the grid's
 * cells closes it. Mounted only while open, and hidden until it is placed.
 * Phones keep the system's number pad (`TouchFretInput`).
 */
export default function TouchFretPad({ control, sheetRef, cursor, offered, pin, layer, onPin, onEnter, onClear, onClose }: Props) {
	const key = cellKey(cursor);
	const [typed, setTyped] = useState({ key, text: "" });
	const text = typed.key === key ? typed.text : "";
	const setText = (next: string) => setTyped({ key, text: next });
	const padRef = useRef<HTMLDivElement>(null);
	const typedRef = useRef<HTMLSpanElement>(null);

	useImperativeHandle(control, () => ({
		flush() {
			const fret = readFretEntry(text).fret;
			setText("");
			if (fret !== null) onEnter(fret, false);
		},
	}));

	// Placing it is layout, not state: written straight onto the elements, the keypad shown
	// only once placed (a hidden element is not scrolled to). What is typed lies over the
	// cursor's cell, in the tab element's coordinates so it scrolls with the grid. Unpinned,
	// the keypad goes under the cell, never past the sides, and the stage scrolls just enough
	// to show it whole (over the cell it would meet the sticky toolbar, under it the dock).
	useLayoutEffect(() => {
		const sheet = sheetRef.current;
		const pad = padRef.current;
		const over = typedRef.current;
		if (!sheet || !pad || !over) return;
		const place = () => {
			const cell = sheet.querySelector<HTMLElement>(".te-mb-cell[data-cur]");
			if (!cell) return false;
			const c = cell.getBoundingClientRect();
			const origin = sheet.getBoundingClientRect();
			over.style.top = `${c.top - origin.top}px`;
			over.style.left = `${c.left - origin.left}px`;
			over.style.width = `${c.width}px`;
			over.style.height = `${c.height}px`;
			if (pin) placePinned(pad, pin);
			else {
				delete pad.dataset.pinned;
				const centred = c.left + c.width / 2 - pad.offsetWidth / 2 - origin.left;
				pad.style.top = `${c.bottom + GAP_PX - origin.top}px`;
				pad.style.left = `${Math.max(0, Math.min(centred, origin.width - pad.offsetWidth))}px`;
			}
			pad.dataset.placed = "";
			return true;
		};
		if (place() && !pin) pad.scrollIntoView({ block: "nearest", inline: "nearest" });
		const watch = new ResizeObserver(() => place());
		watch.observe(sheet);
		window.addEventListener("resize", place);
		return () => {
			watch.disconnect();
			window.removeEventListener("resize", place);
		};
	}, [sheetRef, key, pin]);

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

	// The head drags the keypad: it follows the finger straight on the element, and is pinned
	// where it is let go.
	const drag = useRef<{ id: number; dx: number; dy: number; at: FretPadPin } | null>(null);
	function dragStart(e: ReactPointerEvent<HTMLDivElement>) {
		const pad = padRef.current;
		if (!pad || (e.target as Element).closest("button")) return;
		const r = pad.getBoundingClientRect();
		drag.current = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, at: { x: r.left, y: r.top } };
		e.currentTarget.setPointerCapture(e.pointerId);
		placePinned(pad, drag.current.at);
	}
	function dragMove(e: ReactPointerEvent<HTMLDivElement>) {
		const pad = padRef.current;
		const d = drag.current;
		if (!pad || !d || d.id !== e.pointerId) return;
		d.at = { x: e.clientX - d.dx, y: e.clientY - d.dy };
		placePinned(pad, d.at);
	}
	function dragEnd(e: ReactPointerEvent<HTMLDivElement>) {
		const pad = padRef.current;
		const d = drag.current;
		if (!pad || !d || d.id !== e.pointerId) return;
		drag.current = null;
		onPin(clampPin(d.at, pad));
	}

	function press(k: FretPadKey) {
		const result = pressFretPad(text, k, offered);
		setText(result.text);
		if (result.write) onEnter(result.write.fret, result.write.advance);
		if (result.clear) onClear();
		if (result.close) onClose();
	}

	const where = `${STRING_LABELS[cursor.stringIndex]} string, bar ${cursor.measureIndex + 1}, slot ${cursor.slotIndex + 1}`;
	// Nothing typed on an empty cell: the shape's fret, which an empty Done takes, shown faint.
	const shown = text || (offered !== null ? String(offered) : "");
	const keypad = (
		<div
			ref={padRef}
			className="te-pad"
			role="group"
			aria-label={`Fret keypad: ${where}`}
			// The keys never take focus: the tab element keeps it, and no keyboard comes up.
			onMouseDown={(e) => e.preventDefault()}
		>
			<div
				className="te-pad-head"
				title="Drag to move the keypad"
				onPointerDown={dragStart}
				onPointerMove={dragMove}
				onPointerUp={dragEnd}
				onPointerCancel={dragEnd}
			>
				<span className="te-pad-where">{where}</span>
				<button
					type="button"
					className="te-pad-follow"
					aria-label="Back under the cursor"
					title="Back under the cursor"
					disabled={pin === null}
					onClick={() => onPin(null)}
				>
					<LocateFixed size={16} aria-hidden />
				</button>
				<GripHorizontal className="te-pad-grip" size={18} aria-hidden />
			</div>
			<div className="te-pad-keys">
				{KEYS.map((k) =>
					k === "back" ? (
						<Button key={k} variant="secondary" className="te-pad-key" aria-label={text ? "Delete digit" : "Clear note"} onClick={() => press(k)}>
							<Delete size={22} strokeWidth={2} aria-hidden />
						</Button>
					) : k === "done" ? (
						<Button key={k} variant="primary" className="te-pad-key" aria-label={text === "" && offered !== null ? `Done, fret ${offered}` : "Done"} onClick={() => press(k)}>
							<Check size={22} strokeWidth={2.5} aria-hidden />
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
	return (
		<>
			<span ref={typedRef} className="te-pad-typed" aria-label="Typed fret" data-empty={text === "" ? "" : undefined} hidden={shown === ""}>
				{shown}
			</span>
			{pin && layer ? createPortal(keypad, layer) : keypad}
		</>
	);
}
