"use client";

import { useRef, useState } from "react";

const BPM_TICKS = [
	{ bpm: 60, label: "Slow Practice" },
	{ bpm: 75, label: "Folk" },
	{ bpm: 90, label: "Ballad" },
	{ bpm: 100, label: "Pop / Blues" },
	{ bpm: 110, label: "Funk" },
	{ bpm: 120, label: "Pop / Rock" },
	{ bpm: 130, label: "Rock" },
	{ bpm: 140, label: "Jazz / Hard Rock" },
	{ bpm: 160, label: "Fast Rock" },
] as const;

interface BpmSliderProps {
	bpm: number;
	min: number;
	max: number;
	isPlaying: boolean;
	setBpm: (bpm: number) => void;
	start: () => void;
	stop: () => void;
}

export default function BpmSlider({
	bpm,
	min,
	max,
	isPlaying,
	setBpm,
	start,
	stop,
}: BpmSliderProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const wasPlayingRef = useRef(false);
	const dragBpmRef = useRef(bpm);
	const isDraggingRef = useRef(false);
	const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

	const toPercent = (value: number) => ((value - min) / (max - min)) * 100;
	const percent = toPercent(bpm);

	// Each segment spans from the midpoint before a tick to the midpoint after it.
	// The first segment starts at 0% and the last ends at 100%.
	const segments = BPM_TICKS.map((tick, i) => {
		const tp = toPercent(tick.bpm);
		const prevTp = i === 0 ? 0 : toPercent(BPM_TICKS[i - 1].bpm);
		const nextTp = i === BPM_TICKS.length - 1 ? 100 : toPercent(BPM_TICKS[i + 1].bpm);
		return {
			label: tick.label,
			startPercent: i === 0 ? 0 : (prevTp + tp) / 2,
			endPercent: i === BPM_TICKS.length - 1 ? 100 : (tp + nextTp) / 2,
			tickPercent: tp,
		};
	});

	function bpmFromPointer(clientX: number): number {
		const rect = trackRef.current?.getBoundingClientRect();
		if (!rect) return bpm;
		const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		return Math.round(min + ratio * (max - min));
	}

	function applyBpmChange(newBpm: number): void {
		setBpm(Math.max(min, Math.min(max, newBpm)));
	}

	function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		isDraggingRef.current = true;
		wasPlayingRef.current = isPlaying;
		if (isPlaying) stop();
		dragBpmRef.current = bpm;
		setHoveredSegment(null);
	}

	function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
		if (!isDraggingRef.current) return;
		const newBpm = bpmFromPointer(e.clientX);
		dragBpmRef.current = newBpm;
		setBpm(newBpm);
	}

	function handlePointerUp(): void {
		if (!isDraggingRef.current) return;
		isDraggingRef.current = false;
		applyBpmChange(dragBpmRef.current);
		if (wasPlayingRef.current) start();
		containerRef.current?.blur();
	}

	function handlePointerCancel(): void {
		if (!isDraggingRef.current) return;
		isDraggingRef.current = false;
		applyBpmChange(dragBpmRef.current);
		if (wasPlayingRef.current) start();
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
		let delta = 0;
		if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -1;
		else if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 1;
		else return;
		e.preventDefault();
		applyBpmChange(bpm + delta);
	}

	function handleTrackMouseMove(e: React.MouseEvent<HTMLDivElement>): void {
		const rect = trackRef.current?.getBoundingClientRect();
		if (!rect) return;
		const mousePercent = ((e.clientX - rect.left) / rect.width) * 100;
		let next: number | null = null;
		for (let i = 0; i < segments.length; i++) {
			if (mousePercent >= segments[i].startPercent && mousePercent < segments[i].endPercent) {
				next = i;
				break;
			}
		}
		setHoveredSegment((prev) => (prev === next ? prev : next));
	}

	function handleTrackMouseLeave(): void {
		setHoveredSegment(null);
	}

	return (
		<div
			ref={containerRef}
			role="slider"
			aria-valuenow={bpm}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-label="BPM"
			tabIndex={0}
			onKeyDown={handleKeyDown}
			className="relative w-full select-none focus:outline-none pt-2 pb-2"
		>
			{/* Track */}
			<div
				ref={trackRef}
				className="relative h-1.5 rounded-full bg-slate-100 mx-2"
				onMouseMove={handleTrackMouseMove}
				onMouseLeave={handleTrackMouseLeave}
			>
				{/* Fill */}
				<div
					className="absolute inset-y-0 left-0 rounded-full pointer-events-none bg-denim"
					style={{ width: `${percent}%` }}
				/>

				{/* Genre label tooltip — positioned at the tick's horizontal location */}
				{hoveredSegment !== null && (
					<div
						className="absolute -translate-x-1/2 pointer-events-none whitespace-nowrap
						           rounded px-1.5 py-0.5 z-20 text-[10px] text-white bg-slate-700"
						style={{
							left: `${segments[hoveredSegment].tickPercent}%`,
							bottom: "calc(100% + 8px)",
						}}
					>
						{segments[hoveredSegment].label}
					</div>
				)}

				{/* Tick marks — visual dot + click to jump */}
				{BPM_TICKS.map((tick) => {
					const tp = toPercent(tick.bpm);
					return (
						<div
							key={tick.bpm}
							className="absolute"
							style={{ left: `${tp}%`, top: "50%" }}
						>
							<button
								type="button"
								tabIndex={-1}
								onClick={() => applyBpmChange(tick.bpm)}
								className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 focus:outline-none z-5"
							>
								<span
									className="block w-2 h-2 rounded-full"
									style={{
										backgroundColor:
											tick.bpm <= bpm ? "var(--denim-dark)" : "var(--denim)",
									}}
								/>
							</button>
						</div>
					);
				})}

				{/* Thumb */}
				<div
					className="absolute top-1/2 z-10 w-4 h-4 rounded-full border-2 border-white shadow-sm cursor-grab active:cursor-grabbing bg-denim"
					style={{
						left: `${percent}%`,
						transform: "translate(-50%, -50%)",
					}}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerCancel}
				/>
			</div>
		</div>
	);
}
