"use client";

import { useRef, useState } from "react";

export interface FaderProps {
	min: number;
	max: number;
	step: number;
	value: number;
	onValue: (value: number) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
	// Tick positions as track-width percentages (0–100).
	ticks: number[];
	// Snap targets parallel to `ticks`; when set, each tick becomes clickable and
	// jumps the value directly to its target.
	tickValues?: number[];
	// Labels parallel to `ticks`; when set, hovering a tick's segment shows a tooltip.
	tickLabels?: string[];
	// Scale labels rendered space-between beneath the track.
	scale: string[];
	disabled?: boolean;
	ariaLabel: string;
}

// Hardware fader: 3px track, denim fill, knurled 10×18 thumb, semantic ticks
// and a scale row. Draggable via pointer capture; keyboard arrows/page keys.
export default function Fader({
	min,
	max,
	step,
	value,
	onValue,
	onDragStart,
	onDragEnd,
	ticks,
	tickValues,
	tickLabels,
	scale,
	disabled,
	ariaLabel,
}: FaderProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef(false);
	const [hoveredTick, setHoveredTick] = useState<number | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

	// Segment around tick i spans the midpoints to its neighbours (first starts at
	// 0%, last ends at 100%). Returns the tick index whose segment contains p, or null.
	function segmentIndexAt(p: number): number | null {
		if (!tickLabels) return null;
		for (let i = 0; i < ticks.length; i++) {
			const start = i === 0 ? 0 : (ticks[i - 1] + ticks[i]) / 2;
			const end = i === ticks.length - 1 ? 100 : (ticks[i] + ticks[i + 1]) / 2;
			if (p >= start && p < end) return i;
		}
		return null;
	}
	function handleTrackMouseMove(e: React.MouseEvent<HTMLDivElement>) {
		if (draggingRef.current || !tickLabels) return;
		const el = trackRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const p = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * 100 : 0;
		const next = segmentIndexAt(p);
		setHoveredTick((prev) => (prev === next ? prev : next));
	}
	function handleTrackMouseLeave() {
		setHoveredTick(null);
	}

	function snap(raw: number): number {
		const clamped = Math.min(max, Math.max(min, raw));
		const stepped = Math.round((clamped - min) / step) * step + min;
		return Math.min(max, Math.max(min, stepped));
	}
	// Magnetic tick snapping: if raw maps within ~3% of the range of a tick value,
	// snap to that tick so the thumb visibly "catches" on ticks while dragging.
	function magnetize(raw: number): number {
		if (!tickValues) return raw;
		const threshold = (max - min) * 0.03;
		let best = raw;
		let bestDist = threshold;
		for (const tv of tickValues) {
			const d = Math.abs(raw - tv);
			if (d <= bestDist) {
				bestDist = d;
				best = tv;
			}
		}
		return best;
	}
	function valueFromClientX(clientX: number): number {
		const el = trackRef.current;
		if (!el) return value;
		const rect = el.getBoundingClientRect();
		const p = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
		return magnetize(snap(min + p * (max - min)));
	}
	function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
		if (disabled) return;
		draggingRef.current = true;
		setIsDragging(true);
		setHoveredTick(null);
		e.currentTarget.setPointerCapture(e.pointerId);
		onDragStart?.();
		onValue(valueFromClientX(e.clientX));
	}
	function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
		if (!draggingRef.current) return;
		onValue(valueFromClientX(e.clientX));
	}
	function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
		if (!draggingRef.current) return;
		draggingRef.current = false;
		setIsDragging(false);
		e.currentTarget.releasePointerCapture(e.pointerId);
		onDragEnd?.();
	}
	function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		if (disabled) return;
		let next: number;
		switch (e.key) {
			case "ArrowLeft":
			case "ArrowDown":
				next = value - step;
				break;
			case "ArrowRight":
			case "ArrowUp":
				next = value + step;
				break;
			case "PageDown":
				next = value - step * 10;
				break;
			case "PageUp":
				next = value + step * 10;
				break;
			default:
				return;
		}
		e.preventDefault();
		onValue(snap(next));
	}

	return (
		<div className={`select-none ${disabled ? "pointer-events-none" : ""}`}>
			<div
				role="slider"
				aria-label={ariaLabel}
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={Math.round(value)}
				tabIndex={disabled ? -1 : 0}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onKeyDown={handleKeyDown}
				className={`relative flex h-7 touch-none items-center select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
			>
				<div
					ref={trackRef}
					className="relative h-0.75 w-full touch-none select-none bg-line-strong"
					onMouseMove={handleTrackMouseMove}
					onMouseLeave={handleTrackMouseLeave}
				>
					<div
						className="absolute inset-y-0 left-0 bg-denim"
						style={{ width: `${pct}%` }}
					/>
					{/* Genre tooltip — shown while hovering a tick's segment */}
					{hoveredTick !== null && tickLabels && (
						<div
							className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap bg-ink px-1.5 py-0.5 text-[10px] text-surface"
							style={{
								left: `${ticks[hoveredTick]}%`,
								bottom: "calc(100% + 10px)",
							}}
						>
							{tickLabels[hoveredTick]}
						</div>
					)}
					<div
						className="absolute top-1/2 h-4.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border border-panel bg-ink"
						style={{ left: `${pct}%` }}
					>
						<span
							aria-hidden="true"
							className="absolute inset-x-0.5 inset-y-1"
							style={{
								background:
									"repeating-linear-gradient(90deg, var(--bg-panel) 0 1px, transparent 1px 3px)",
							}}
						/>
					</div>
					<div aria-hidden="true" className="absolute inset-x-0 top-full h-1.5">
						{ticks.map((t) => (
							<span
								key={t}
								className="absolute top-0.5 h-1 w-px bg-ink-faint"
								style={{ left: `${t}%` }}
							/>
						))}
					</div>
					{/* Click-to-snap hit areas over each tick — stop propagation so pressing
					    a tick jumps to its value instead of starting a track drag. */}
					{tickValues &&
						ticks.map((t, i) => (
							<button
								key={t}
								type="button"
								tabIndex={-1}
								aria-hidden="true"
								onPointerDown={(e) => e.stopPropagation()}
								onClick={() => onValue(tickValues[i])}
								className="absolute top-full h-2.5 w-4 -translate-x-1/2 cursor-pointer touch-none select-none focus:outline-none"
								style={{ left: `${t}%` }}
							/>
						))}
				</div>
			</div>
			<div className="mt-2 flex justify-between font-mono text-[8px] tracking-[0.08em] text-ink-faint">
				{scale.map((s, i) => (
					<span key={i}>{s}</span>
				))}
			</div>
		</div>
	);
}
