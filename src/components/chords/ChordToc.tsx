"use client";

import { useState, useEffect, useMemo } from "react";
import { buildToc } from "@/lib/chordToc";
import type { BrowseSection } from "@/lib/chordBrowseSections";
import MusicalText from "@/components/MusicalText";
import { cn } from "@/lib/utils";

interface Props {
	sections: BrowseSection[];
}

export default function ChordToc({ sections }: Props) {
	const entries = useMemo(() => buildToc(sections), [sections]);
	const [activeId, setActiveId] = useState<string>(entries[0]?.id ?? "");

	// When grouping changes, activeId may no longer correspond to a valid entry.
	// Fall back to the first entry rather than calling setState synchronously
	// inside the effect (which triggers the react-hooks/set-state-in-effect rule).
	const displayActiveId = useMemo(
		() => (entries.some((e) => e.id === activeId) ? activeId : (entries[0]?.id ?? "")),
		[entries, activeId],
	);

	useEffect(() => {
		if (entries.length === 0) return;

		const ids = entries.map((e) => e.id);

		// Watch the top ~30% of the viewport. When a heading enters this zone the
		// user has scrolled into (or near) that section — mark it active.
		// When no heading is entering (mid-section scroll), we keep the last state.
		const observer = new IntersectionObserver(
			(ioEntries) => {
				const entering = ioEntries.filter((e) => e.isIntersecting).map((e) => e.target.id);
				if (entering.length > 0) {
					// Among simultaneously entering headings, pick the topmost in TOC order.
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

	return (
		<nav
			className="group fixed right-2 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-1 rounded-lg p-2 transition-colors hover:bg-background/95 hover:shadow-sm lg:flex"
			aria-label="Chord sections"
		>
			{entries.map((entry) => (
				<button
					key={entry.id}
					type="button"
					onClick={() => scrollTo(entry.id)}
					aria-label={`Jump to ${entry.label}`}
					className={cn(
						"flex items-center rounded py-0.5 transition-colors",
						entry.level === 2 && "ml-3",
						w,
					)}
				>
					{/* Collapsed state: short horizontal line segment */}
					<span
						className={cn(
							"block rounded-full transition-colors group-hover:hidden",
							entry.level === 1 ? "h-0.5 w-5" : "h-[1.5px] w-3",
							displayActiveId === entry.id
								? "bg-denim"
								: entry.level === 1
									? "bg-muted-foreground/50"
									: "bg-muted-foreground/25",
						)}
					/>
					{/* Expanded state: full text label */}
					<span
						className={cn(
							"hidden whitespace-nowrap text-xs group-hover:block",
							entry.level === 1
								? "font-medium text-muted-foreground hover:text-foreground"
								: "text-muted-foreground/60 hover:text-muted-foreground",
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
