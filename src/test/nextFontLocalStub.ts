// `next/font/local` is a compile-time transform: the Next plugin replaces the
// call with generated CSS, so the module's runtime default is not callable and
// importing it under Vitest throws "default is not a function". Anything that
// imports `src/app/fonts/fonts.ts` — the fingerpick staves, which need the
// family name for text drawn outside the DOM — would drag that in.
//
// The shape returned is what the real loader returns. The family name is a
// stand-in: unit tests assert on structure, never on the name, and the name the
// real loader produces is not knowable outside a build anyway.
type LocalFont = {
	className: string;
	variable: string;
	style: { fontFamily: string; fontWeight?: number; fontStyle?: string };
};

export default function localFont(): LocalFont {
	return {
		className: "next-font-stub",
		variable: "next-font-stub-variable",
		style: { fontFamily: "next-font-stub" },
	};
}
