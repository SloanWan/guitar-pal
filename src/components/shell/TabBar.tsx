"use client";

import type { CSSProperties } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/AppLink";
import { Pick } from "@/components/ui/pick";
import { TAB_ITEMS, tabKeyForPath } from "@/lib/navigation";
import { signInHref } from "@/lib/safeRedirect";
import { NavIcon } from "./NavIcon";
import { indicatorColour } from "./NavLinks";

/**
 * The phone tab bar (< 720px): Home, Strum, Tab, Chords, Me. The current tab's icon fills
 * and a pick drops from the top edge over it. Books and Fretboard live in More, so on
 * their pages no tab is current. Me is Settings when signed in, sign-in otherwise.
 */
export default function TabBar({ signedIn }: { signedIn: boolean }) {
	const pathname = usePathname();
	const search = useSearchParams().toString();
	const active = tabKeyForPath(pathname);
	const index = TAB_ITEMS.findIndex((t) => t.key === active);
	const meHref = signedIn ? "/settings" : signInHref(pathname, search ? `?${search}` : "");

	return (
		<nav aria-label="Tabs" className="gp-tabbar">
			{TAB_ITEMS.map((item) => (
				<Link
					key={item.key}
					href={item.key === "me" ? meHref : item.href}
					data-m={item.module}
					aria-current={item.key === active ? "page" : undefined}
				>
					<NavIcon name={item.key} />
					<span>{item.label}</span>
				</Link>
			))}
			<span
				className="gp-tab-ind"
				hidden={index < 0}
				aria-hidden
				style={{ "--i": index, "--gp-ind": indicatorColour(TAB_ITEMS[Math.max(index, 0)].module) } as CSSProperties}
			>
				{/* keyed by the tab, so the drop plays again on every change */}
				<Pick key={active ?? "none"} />
			</span>
		</nav>
	);
}
