"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/AppLink";
import { Pick } from "@/components/ui/pick";
import { NAV_ITEMS, navKeyForPath } from "@/lib/navigation";
import type { ModuleKey } from "@/lib/moduleForPath";
import { cn } from "@/lib/utils";
import { NavIcon } from "./NavIcon";

/** The colour the active item's pick wears: its module's 500, ink for Home. */
export const indicatorColour = (module: ModuleKey): string => (module === "home" ? "var(--gp-ink)" : `var(--gp-${module}-500)`);

/**
 * The header nav (≥ 720px): icon and label for each destination. The current one wears
 * its filled icon in its module colour, with a pick hanging under it that springs from
 * item to item; hovering another draws a skewed line under it.
 */
export default function NavLinks({ className }: { className?: string }) {
	const pathname = usePathname();
	const active = navKeyForPath(pathname);
	const activeItem = NAV_ITEMS.find((i) => i.key === active);
	const navRef = useRef<HTMLElement>(null);
	const pickRef = useRef<HTMLSpanElement>(null);

	// Placing the pick is layout, not state: it is written straight onto the element,
	// once now and again whenever the nav's size changes (fonts landing, a resize).
	useEffect(() => {
		const nav = navRef.current;
		const pick = pickRef.current;
		if (!nav || !pick) return;
		const place = () => {
			const link = nav.querySelector<HTMLElement>('[aria-current="page"]');
			if (!link || !link.offsetWidth) {
				pick.dataset.placed = "false";
				return;
			}
			const firstPlacement = pick.dataset.placed !== "true";
			pick.style.transform = `translateX(${link.offsetLeft + link.offsetWidth / 2 - 6}px)`;
			if (firstPlacement) {
				// land without sliding in from the left edge
				void pick.offsetWidth;
				pick.dataset.placed = "true";
			}
		};
		place();
		const observer = new ResizeObserver(place);
		observer.observe(nav);
		return () => observer.disconnect();
	}, [active]);

	return (
		<nav
			ref={navRef}
			aria-label="Main"
			className={cn("gp-nav", className)}
			style={activeItem ? ({ "--gp-ind": indicatorColour(activeItem.module) } as React.CSSProperties) : undefined}
		>
			{NAV_ITEMS.map((item) => (
				<Link
					key={item.key}
					href={item.href}
					data-m={item.module}
					aria-current={item.key === active ? "page" : undefined}
				>
					<NavIcon name={item.key} />
					<span className="gp-nav-l">{item.label}</span>
				</Link>
			))}
			<span ref={pickRef} className="gp-nav-ind" data-placed="false" aria-hidden>
				<Pick className="block size-full" />
			</span>
		</nav>
	);
}
