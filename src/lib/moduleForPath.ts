/**
 * The Candy module a route belongs to. It drives `data-m` on the page shell, which
 * re-points the `--gp-m-*` "current module" colour aliases in `src/app/tokens.css`.
 * Pages without a module (Home, Settings, Share, the landing hub, …) are "home".
 */
export type ModuleKey = "strum" | "tab" | "chords" | "fb" | "books" | "home";

const PREFIXES: readonly (readonly [string, ModuleKey])[] = [
	["/strum", "strum"],
	["/fingerpick", "tab"],
	["/chords", "chords"],
	["/fretboard", "fb"],
	["/books", "books"],
];

export function moduleForPath(pathname: string | null | undefined): ModuleKey {
	if (!pathname) return "home";
	for (const [prefix, key] of PREFIXES) {
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key;
	}
	return "home";
}
