import {
	TAB_STRIP_HEIGHT,
	TAB_STRIP_LINE_Y,
	TAB_STRIP_WIDTH,
	type TabStripSpec,
} from "@/lib/fingerpickToTabStrip";

/**
 * The animated TAB notation behind the landing hero and the sign-in page
 * (additional-components §8): two strips of fret numbers drifting in opposite
 * directions, faded top and bottom. The front strip reads in denim, the back
 * one recedes. Pure CSS animation, paused for reduced motion.
 */

/** Colours per layer; geometry comes from the spec. */
const LAYER = {
	front: { line: "var(--line)", num: "var(--denim)" },
	back: { line: "var(--tab-line-2)", num: "var(--tab-num-2)" },
} as const;

function TabStripSvg({ spec, layer }: { spec: TabStripSpec; layer: keyof typeof LAYER }) {
	const { line, num } = LAYER[layer];
	return (
		<svg
			width={TAB_STRIP_WIDTH}
			height={TAB_STRIP_HEIGHT}
			viewBox={`0 0 ${TAB_STRIP_WIDTH} ${TAB_STRIP_HEIGHT}`}
			xmlns="http://www.w3.org/2000/svg"
			className="flex-none"
		>
			<g stroke={line} strokeWidth="1">
				{TAB_STRIP_LINE_Y.map((y) => (
					<line key={`line-${y}`} x1="0" y1={y} x2={TAB_STRIP_WIDTH} y2={y} />
				))}
				{spec.barlines.map((x) => (
					<line key={`bar-${x}`} x1={x} y1="10" x2={x} y2="80" />
				))}
			</g>
			<g fontFamily="var(--mono)" fontSize="12" fill={num}>
				{spec.notes.map(([x, y, fret]) => (
					<text key={`note-${x}-${y}`} x={x} y={y}>
						{fret}
					</text>
				))}
			</g>
		</svg>
	);
}

/** The front strip's travel; the back strip always goes the other way. */
const SCROLL = {
	left: {
		front: "animate-[tabscroll_60s_linear_infinite]",
		back: "animate-[tabscroll-rev_80s_linear_infinite]",
	},
	right: {
		front: "animate-[tabscroll-rev_60s_linear_infinite]",
		back: "animate-[tabscroll_80s_linear_infinite]",
	},
} as const;

/**
 * Fills its nearest positioned ancestor. Each strip is doubled so the loop
 * (a translate of −50%) is seamless. `direction` is where the front strip
 * travels: the landing reads left, the sign-in page right, so the two pages
 * do not look like one.
 */
export default function TabStripBackdrop({
	front,
	back,
	direction = "left",
}: {
	front: TabStripSpec;
	back: TabStripSpec;
	direction?: keyof typeof SCROLL;
}) {
	const scroll = SCROLL[direction];
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-16 opacity-50 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)] mask-[linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]"
		>
			<div className={`flex w-max motion-reduce:animate-none ${scroll.front}`}>
				<TabStripSvg spec={front} layer="front" />
				<TabStripSvg spec={front} layer="front" />
			</div>
			<div className={`flex w-max motion-reduce:animate-none ${scroll.back}`}>
				<TabStripSvg spec={back} layer="back" />
				<TabStripSvg spec={back} layer="back" />
			</div>
		</div>
	);
}
