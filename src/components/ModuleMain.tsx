"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";
import { moduleForPath } from "@/lib/moduleForPath";
import { navKeyForPath } from "@/lib/navigation";

/** What a header or tab bar link marks its navigation with, so only those animate (#489). */
export const SECTION_TRANSITION = "section";
const ONLY_SECTIONS = { [SECTION_TRANSITION]: SECTION_TRANSITION, default: "none" } as const;

/**
 * The page's <main>, carrying `data-m` so the --gp-m-* tokens follow the current module.
 *
 * A move to another section (#489) leaves and enters as a view transition: the old page
 * fades away a little up, the new one fades in while its sections rise (`gp-rise`), and
 * the header stays put (shell.css). Keyed by the section, so a move inside one (the reader
 * to its editor) is no transition, and only a navigation typed `section` — a header or
 * tab bar link — animates; the browser's back and forward stay instant. The boundary is
 * <main> itself rather than the page, so what is snapshotted is clipped to its box.
 */
export default function ModuleMain({ className, children }: { className?: string; children: React.ReactNode }) {
	const pathname = usePathname();
	return (
		<ViewTransition key={navKeyForPath(pathname) ?? pathname} enter={ONLY_SECTIONS} exit={ONLY_SECTIONS} default="none">
			<main className={className} data-m={moduleForPath(pathname)}>
				{children}
			</main>
		</ViewTransition>
	);
}
