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
				const entering = ioEntries
					.filter((e) => e.isIntersecting)
					.map((e) => e.target.id);
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
			className="fixed right-0 top-0 z-30 h-full w-5 flex flex-col py-10 divide-y divide-border/40 lg:hidden"
			aria-label="Chord sections"
		>
			{entries.map(({ id, label }) => {
				const isActive = displayActiveId === id;
				return (
					<button
						key={id}
						type="button"
						className="flex-1 flex items-center justify-end"
						onClick={() => scrollTo(id)}
						aria-label={`Jump to ${label}`}
					>
						<span
							className={cn(
								"block rounded-l-sm transition-all duration-200 ease-in-out",
								isActive
									? "w-2.5 h-8 bg-denim"
									: "w-1.5 h-5 bg-muted-foreground/25",
							)}
						/>
					</button>
				);
			})}
		</nav>
	);
}
