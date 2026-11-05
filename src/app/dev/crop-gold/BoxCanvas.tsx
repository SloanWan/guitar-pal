"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
	HANDLES,
	MIN_SIZE,
	boxFromDrag,
	moveBox,
	resizeBox,
	type Box,
	type CropBox,
	type Handle,
} from "@/lib/cropGold";

/** Box colours: on a white book page in either theme, so fixed rather than tokens. */
export const BOX_COLOURS = ["#d1342f", "#1f6fd1", "#1d8a3a", "#c76a00", "#8a2bb8", "#0f8c8c"];

type Drag =
	| { kind: "move"; id: string; from: readonly [number, number]; start: Box }
	| { kind: "resize"; id: string; handle: Handle; from: readonly [number, number]; start: Box }
	| { kind: "draw"; from: readonly [number, number] };

const pct = (v: number): string => `${v * 100}%`;

/**
 * The page with its boxes over it. A box is moved by its body and resized by
 * its handles; a drag on the bare page draws a new one. Pointer capture keeps
 * the drag on the canvas, so nothing is listened for on the window.
 */
export default function BoxCanvas({
	src,
	alt,
	boxes,
	order,
	selected,
	onSelect,
	onChange,
	onDraw,
	onLoad,
}: {
	src: string;
	alt: string;
	boxes: readonly CropBox[];
	/** Box id → its number on the page (reading order). */
	order: ReadonlyMap<string, number>;
	selected: string | null;
	onSelect: (id: string | null) => void;
	onChange: (id: string, box: Box) => void;
	onDraw: (box: Box) => void;
	onLoad: (size: { width: number; height: number }) => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const drag = useRef<Drag | null>(null);
	const [ghost, setGhost] = useState<Box | null>(null);

	function at(event: ReactPointerEvent): readonly [number, number] {
		const rect = ref.current?.getBoundingClientRect();
		if (!rect || rect.width === 0 || rect.height === 0) return [0, 0];
		return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
	}

	function begin(event: ReactPointerEvent, next: Drag) {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		ref.current?.setPointerCapture(event.pointerId);
		drag.current = next;
	}

	function onPointerMove(event: ReactPointerEvent) {
		const d = drag.current;
		if (!d) return;
		const [x, y] = at(event);
		if (d.kind === "draw") {
			setGhost(boxFromDrag(d.from, [x, y]));
			return;
		}
		const dx = x - d.from[0];
		const dy = y - d.from[1];
		onChange(d.id, d.kind === "move" ? moveBox(d.start, dx, dy) : resizeBox(d.start, d.handle, dx, dy));
	}

	function onPointerUp(event: ReactPointerEvent) {
		const d = drag.current;
		drag.current = null;
		if (ref.current?.hasPointerCapture(event.pointerId)) ref.current.releasePointerCapture(event.pointerId);
		if (d?.kind !== "draw") return;
		const box = boxFromDrag(d.from, at(event));
		setGhost(null);
		// A click on the bare page clears the selection; only a real drag draws.
		if (box[2] - box[0] > MIN_SIZE * 2 && box[3] - box[1] > MIN_SIZE * 2) onDraw(box);
		else onSelect(null);
	}

	return (
		<div
			ref={ref}
			className="cg-canvas"
			onPointerDown={(e) => begin(e, { kind: "draw", from: at(e) })}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={() => {
				drag.current = null;
				setGhost(null);
			}}
		>
			{/* eslint-disable-next-line @next/next/no-img-element -- a local dev route's PNG, not an optimizable asset */}
			<img
				src={src}
				alt={alt}
				draggable={false}
				className="cg-page"
				onLoad={(e) => onLoad({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
			/>
			{boxes.map((b) => {
				const n = order.get(b.id) ?? 0;
				const colour = BOX_COLOURS[(n - 1 + BOX_COLOURS.length) % BOX_COLOURS.length];
				const isSelected = b.id === selected;
				return (
					<div
						key={b.id}
						className="cg-box"
						data-selected={isSelected || undefined}
						data-off={!b.exercise || undefined}
						style={{
							left: pct(b.box[0]),
							top: pct(b.box[1]),
							width: pct(b.box[2] - b.box[0]),
							height: pct(b.box[3] - b.box[1]),
							borderColor: colour,
						}}
						onPointerDown={(e) => {
							onSelect(b.id);
							begin(e, { kind: "move", id: b.id, from: at(e), start: b.box });
						}}
					>
						<span className="cg-box-n" style={{ background: colour }}>
							{n}
						</span>
						{isSelected &&
							HANDLES.map((handle) => (
								<span
									key={handle}
									className="cg-handle"
									data-handle={handle}
									style={{ borderColor: colour }}
									onPointerDown={(e) => begin(e, { kind: "resize", id: b.id, handle, from: at(e), start: b.box })}
								/>
							))}
					</div>
				);
			})}
			{ghost && (
				<div
					className="cg-box cg-ghost"
					style={{
						left: pct(ghost[0]),
						top: pct(ghost[1]),
						width: pct(ghost[2] - ghost[0]),
						height: pct(ghost[3] - ghost[1]),
					}}
				/>
			)}
		</div>
	);
}
