"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/* Small hardware quotes the landing's demo frames share. They mirror the app's
   own recipes (LED §5.11, module label §5.9, BPM readout §5.7, pills §5.6)
   without importing workspace components that carry state. */

export const MODULE_LABEL =
	"flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint";

/** Entrance for anything a chapter adds as its story moves on: a short fade up, none under reduced motion. */
export const ENTER = "animate-[landing-in_0.25s_ease-out_both] motion-reduce:animate-none";

/** The same entrance for every SVG inserted under an element — a step grid's arrows, a bar's shape. */
export const ENTER_SVGS =
	"[&_svg]:animate-[landing-in_0.2s_ease-out_both] motion-reduce:[&_svg]:animate-none";

export const UNIT_LABEL = "font-mono text-[8px] uppercase tracking-[0.28em] text-ink-faint";

export function Led({ on = false, breathe = false }: { on?: boolean; breathe?: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={`size-1.5 flex-none rounded-full transition-[background-color,box-shadow] duration-200 ${
				on ? "bg-denim-accent shadow-(--glow-led)" : "bg-ink-faint"
			} ${breathe ? "animate-[ledbreathe_2.4s_ease-in-out_infinite] motion-reduce:animate-none" : ""}`}
		/>
	);
}

export function Pill({
	on = false,
	hidden = false,
	children,
}: {
	on?: boolean;
	hidden?: boolean;
	children: ReactNode;
}) {
	return (
		<span
			aria-hidden={hidden || undefined}
			className={`inline-flex items-center gap-2 border px-2.5 py-[7px] font-mono text-[10px] uppercase tracking-[0.12em] transition-[opacity,border-color,background-color,color] duration-200 ${
				on ? "border-denim bg-denim text-on-denim" : "border-line-strong text-ink-dim"
			} ${hidden ? "opacity-0" : ""}`}
		>
			{children}
		</span>
	);
}

/** The app's BPM readout with its LCD segment ghost, at the desktop or the mobile-bar size. */
export function BpmReadout({ bpm, size = "lg" }: { bpm: number; size?: "lg" | "sm" }) {
	return (
		<span
			className={`relative inline-block font-mono font-bold leading-none tracking-[-0.02em] text-denim text-shadow-(--glow-readout) ${
				size === "lg" ? "text-[44px] max-[900px]:text-[28px]" : "text-[28px]"
			}`}
		>
			<span aria-hidden="true" className="absolute inset-0 opacity-[0.09]">
				888
			</span>
			<span className="relative tabular-nums">{String(bpm).padStart(3, "0")}</span>
		</span>
	);
}

/**
 * A box whose height follows its content through a transition, so a demo
 * that grows as its story goes on — a bar that gains its chord's shape, a
 * chapter list that opens — eases to its new size instead of jumping. The
 * first measurement lands without animating; reduced motion never animates.
 */
export function AutoHeight({ children, className = "" }: { children: ReactNode; className?: string }) {
	const inner = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | null>(null);
	useLayoutEffect(() => {
		const el = inner.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return (
		<div
			className={`overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none ${className}`}
			style={{ height: height ?? "auto" }}
		>
			<div ref={inner} className="flow-root">
				{children}
			</div>
		</div>
	);
}
