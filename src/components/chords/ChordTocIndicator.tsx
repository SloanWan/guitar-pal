"use client";

import { useState, useEffect, useMemo } from "react";
import { buildToc } from "@/lib/chordToc";
import type { BrowseSection } from "@/lib/chordBrowseSections";
import { cn } from "@/lib/utils";

interface Props {
	sections: BrowseSection[];
}

export default function ChordTocIndicator({ sections }: Props) {
	const entries = useMemo(() => buildToc(sections), [sections]);
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

	if (entries.length === 0) return null;

	return (
		<nav
			className="fixed right-4.5 top-1/2 z-30 -translate-y-1/2 w-14 flex flex-col lg:hidden"
			aria-label="Chord sections"
		>
			{entries.map(({ id, label }) => {
				const isActive = displayActiveId === id;
				return (
					<button
						key={id}
						type="button"
						className="h-7 flex items-center justify-end pr-1 overflow-hidden"
						onClick={() => scrollTo(id)}
						aria-label={`Jump to ${label}`}
					>
						<span
							className={cn(
								"truncate text-right transition-all duration-200 ease-in-out",
								isActive
									? "text-[10px] sm:text-[11px] font-semibold text-denim"
									: "text-[8px] sm:text-[9px] font-normal text-muted-foreground/35",
							)}
						>
							{label}
						</span>
					</button>
				);
			})}
		</nav>
	);
}
