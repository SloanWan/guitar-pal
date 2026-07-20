"use client";

import { useState, useEffect, useMemo } from "react";
import { buildToc, tocSectionId } from "@/lib/chordToc";
import type { BrowseSection } from "@/lib/chordBrowseSections";
import { ROOT_CHROMATIC_ORDER } from "@/lib/chordSuffixes";
import MusicalText from "@/components/MusicalText";
import { cn } from "@/lib/utils";

interface Props {
	sections: BrowseSection[];
}

const NATURAL_ROOTS = new Set(["C", "D", "E", "F", "G", "A", "B"]);

export default function ChordToc({ sections }: Props) {
	const entries = useMemo(() => buildToc(sections), [sections]);
	const isRootFirst = useMemo(
		() => sections.length > 0 && ROOT_CHROMATIC_ORDER.includes(sections[0].label),
		[sections],
	);
	const [activeId, setActiveId] = useState<string>(entries[0]?.id ?? "");

	const displayActiveId = useMemo(
		() => (entries.some((e) => e.id === activeId) ? activeId : (entries[0]?.id ?? "")),
		[entries, activeId],
	);

	useEffect(() => {
		if (entries.length === 0) return;
		const ids = entries.map((e) => e.id);
		const observer = new IntersectionObserver(
			(ioEntries) => {
				const entering = ioEntries.filter((e) => e.isIntersecting).map((e) => e.target.id);
				if (entering.length > 0) {
					const topmost = ids.find((id) => entering.includes(id));
					if (topmost) setActiveId(topmost);
				}
			},
			{ rootMargin: "0px 0px -70% 0px" },
		);
		for (const { id } of entries) {
			const el = document.getElementById(id);
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
	}, [entries]);

	function scrollTo(id: string) {
		document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	// ── Root-first: piano-key sidebar ────────────────────────────────────────
	if (isRootFirst) {
		const rootSet = new Set(sections.map((s) => s.label));
		const orderedRoots = ROOT_CHROMATIC_ORDER.filter((r) => rootSet.has(r));

		// Nav is fixed-width (widest expanded key = w-36) so each button can grow
		// leftward within it. items-end right-anchors every button, so their right
		// edges stay pinned while their left edges advance as width grows.
		return (
			<nav
				className="group fixed right-2 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-end gap-1 lg:flex w-28"
				aria-label="Chord sections"
			>
				{orderedRoots.map((root) => {
					const id = tocSectionId(root);
					const isActive = displayActiveId === id;
					const isNatural = NATURAL_ROOTS.has(root);
					return (
						// Each button IS the key. White keys grow further left than black
						// keys, matching real piano key-length proportions.
						<button
							key={root}
							type="button"
							onClick={() => scrollTo(id)}
							aria-label={`Jump to ${root} chords`}
							className={cn(
								"flex items-center justify-end overflow-hidden rounded-none border",
								"transition-all duration-200 ease-in-out cursor-pointer",
								isNatural
									? cn(
											"h-7 w-9 group-hover:w-28",
											isActive
												? "bg-denim border-denim"
												: "bg-surface border-line-strong hover:bg-denim-tint",
										)
									: cn(
											"h-5 w-5 group-hover:w-18",
											isActive
												? "bg-denim border-denim"
												: "bg-zinc-600 border-zinc-600 hover:bg-denim",
										),
							)}
						>
							{/* Label inside the key — justify-end keeps it near the right edge */}
							<span
								className={cn(
									"pr-2 text-xs font-medium whitespace-nowrap",
									"opacity-0 group-hover:opacity-100 transition-opacity duration-200",
									isActive
										? "text-white"
										: isNatural
											? "text-ink"
											: "text-zinc-100",
								)}
							>
								<MusicalText
									text={root}
									className="space-x-[0.01em]"
									symbolClassName="font-[system-ui] text-[1.2em] translate-y-[0.15em] inline-block"
								/>
							</span>
						</button>
					);
				})}
			</nav>
		);
	}

	// ── Category-first: existing thin-line Notion-style outline ──────────────
	return (
		<nav
			className="group fixed right-2 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-1 rounded-none p-2 transition-all duration-200 ease-in-out hover:bg-panel/95 lg:flex"
			aria-label="Chord sections"
		>
			{entries.map((entry) => (
				<button
					key={entry.id}
					type="button"
					onClick={() => scrollTo(entry.id)}
					aria-label={`Jump to ${entry.label}`}
					className={cn("flex items-center rounded-none py-0.5", entry.level === 2 && "ml-3")}
				>
					{/* Line — shrinks away as sidebar expands */}
					<span
						className={cn(
							"block shrink-0 rounded-none transition-all duration-200 ease-in-out",
							"group-hover:w-0 group-hover:opacity-0",
							entry.level === 1 ? "h-0.5 w-5" : "h-[1.5px] w-3",
							displayActiveId === entry.id
								? "bg-denim"
								: entry.level === 1
									? "bg-ink-faint"
									: "bg-ink-faint/50",
						)}
					/>
					{/* Label — fades and slides in as line retreats */}
					<span
						className={cn(
							"overflow-hidden whitespace-nowrap text-xs",
							"transition-all duration-400 ease-in-out",
							"max-w-0 opacity-0 group-hover:max-w-50 group-hover:opacity-100 group-hover:mr-5",
							entry.level === 1
								? "font-medium text-ink-dim hover:text-ink"
								: "text-ink-faint hover:text-ink-dim",
							displayActiveId === entry.id && "text-denim!",
						)}
					>
						<MusicalText text={entry.label} />
					</span>
				</button>
			))}
		</nav>
	);
}
