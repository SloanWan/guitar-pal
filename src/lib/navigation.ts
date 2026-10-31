import type { ModuleKey } from "@/lib/moduleForPath";

/** The header's destinations (≥ 720px), in order. */
export type NavKey = "home" | "strum" | "tab" | "chords" | "fretboard" | "books";
/** The phone tab bar's: Books and Fretboard live in More, the account in Me. */
export type TabKey = "home" | "strum" | "tab" | "chords" | "me";

export interface NavItem<K extends string> {
	key: K;
	label: string;
	href: string;
	/** Whose colour the active icon and the pick wear. */
	module: ModuleKey;
}

export const NAV_ITEMS: readonly NavItem<NavKey>[] = [
	{ key: "home", label: "Home", href: "/", module: "home" },
	{ key: "strum", label: "Strum", href: "/strum", module: "strum" },
	{ key: "tab", label: "Tab", href: "/fingerpick", module: "tab" },
	{ key: "chords", label: "Chords", href: "/chords", module: "chords" },
	{ key: "fretboard", label: "Fretboard", href: "/fretboard", module: "fb" },
	{ key: "books", label: "Books", href: "/books", module: "books" },
];

/** The tab bar's; Me's href depends on the visitor and is filled in by the shell. */
export const TAB_ITEMS: readonly NavItem<TabKey>[] = [
	{ key: "home", label: "Home", href: "/", module: "home" },
	{ key: "strum", label: "Strum", href: "/strum", module: "strum" },
	{ key: "tab", label: "Tab", href: "/fingerpick", module: "tab" },
	{ key: "chords", label: "Chords", href: "/chords", module: "chords" },
	{ key: "me", label: "Me", href: "/settings", module: "home" },
];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The header item a route belongs to, or null (settings, auth, a share link, the docs). */
export function navKeyForPath(pathname: string): NavKey | null {
	if (pathname === "/" || pathname === "/home") return "home";
	if (under(pathname, "/strum")) return "strum";
	// the tab reader and, once it is its own page, the tab editor (/fingerpick/edit/…)
	if (under(pathname, "/fingerpick")) return "tab";
	if (under(pathname, "/chords")) return "chords";
	if (under(pathname, "/fretboard")) return "fretboard";
	if (under(pathname, "/books")) return "books";
	return null;
}

/** The tab bar's item for a route: "more" for the pages only More reaches, else null. */
export function tabKeyForPath(pathname: string): TabKey | "more" | null {
	if (under(pathname, "/settings") || under(pathname, "/auth")) return "me";
	const nav = navKeyForPath(pathname);
	if (nav === "fretboard" || nav === "books") return "more";
	return nav;
}
