import localFont from "next/font/local";

// Self-hosted rather than fetched from Google at build time (#291): that fetch
// failed three times in three days, once on a branch that changed nothing but a
// Markdown file, and a flaked build on main silently skips the deploy. The files
// are the ones Google was serving — JetBrains Mono 2.211, Space Grotesk 2.000,
// the same variable weight axes — so no glyph or metric moves. See README.md
// here for how they were fetched and how to refresh them.
//
// Declared in their own module, not in `layout.tsx`, because the family name
// `next/font/local` generates is derived from the variable it is assigned to and
// so is not something anything else can spell out. Whatever needs the family by
// name — the VexFlow staves, which draw text outside the DOM — imports `mono`
// from here and reads `mono.style.fontFamily`.

export const mono = localFont({
	src: "./JetBrainsMono-latin-greek.woff2",
	weight: "400 800",
	style: "normal",
	variable: "--font-jbmono",
	display: "swap",
});

export const sans = localFont({
	src: "./SpaceGrotesk-Variable-latin.woff2",
	weight: "300 700",
	style: "normal",
	variable: "--font-grotesk",
	display: "swap",
});

/** For canvas and SVG text, which cannot read the CSS variable. */
export const MONO_FAMILY = `${mono.style.fontFamily}, ui-monospace, monospace`;
