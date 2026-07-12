import Link from "next/link";
import type { ReactNode } from "react";
import NavBar from "@/components/NavBar";

/* v3 landing — spec: guitar-pal-design-decisions/fable (layout-specs §6,
   component-patterns §2/§3/§8, additional-components §1/§7/§8/§10/§11);
   TAB strip geometry and copy taken verbatim from guitar-pal-landing-v3.html. */

const EYEBROW =
	"font-mono text-[length:var(--text-eyebrow-size)] uppercase tracking-[var(--text-eyebrow-ls)] text-denim-accent";

const BTN_BASE =
	"inline-block border px-7 py-3.5 font-mono text-[length:var(--text-btn-size)] uppercase tracking-[var(--text-btn-ls)] transition-[border-color,background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim-accent";
const BTN_PRIMARY = `${BTN_BASE} border-denim bg-denim text-on-denim hover:border-denim-accent hover:bg-denim-accent active:border-denim-accent active:bg-denim-accent`;
const BTN_GHOST = `${BTN_BASE} border-line-strong text-ink hover:border-denim hover:text-denim-accent active:border-denim active:bg-denim-tint`;

const FOOTER_LINK =
	"transition-colors duration-150 hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim-accent";

/* Hero background TAB strips (additional-components §8) */

type TabNote = readonly [x: number, y: number, fret: string];

interface TabStripSpec {
	line: string;
	num: string;
	barlines: readonly number[];
	notes: readonly TabNote[];
}

const TAB_LINES_Y = [10, 24, 38, 52, 66, 80] as const;

const STRIP_FRONT: TabStripSpec = {
	line: "var(--line)",
	num: "var(--denim)",
	barlines: [200, 400, 600, 800, 1000, 1200, 1400, 1599],
	notes: [
		[30, 84, "3"], [70, 42, "0"], [110, 28, "1"], [150, 14, "0"],
		[240, 70, "2"], [280, 56, "2"], [320, 42, "0"], [360, 28, "1"],
		[430, 84, "0"], [470, 56, "2"], [510, 28, "1"], [550, 14, "0"],
		[640, 70, "3"], [680, 42, "0"], [720, 28, "0"], [760, 56, "2"],
		[830, 84, "5"], [870, 42, "7"], [910, 28, "5"], [950, 14, "7"],
		[1040, 70, "2"], [1080, 56, "4"], [1120, 42, "2"], [1160, 28, "3"],
		[1230, 84, "0"], [1270, 42, "2"], [1310, 28, "3"], [1350, 56, "2"],
		[1440, 70, "2"], [1480, 42, "0"], [1520, 28, "1"], [1560, 14, "0"],
	],
};

const STRIP_BACK: TabStripSpec = {
	line: "var(--tab-line-2)",
	num: "var(--tab-num-2)",
	barlines: [266, 533, 800, 1066, 1333, 1599],
	notes: [
		[40, 56, "0"], [100, 42, "2"], [160, 28, "2"], [220, 14, "0"],
		[300, 84, "3"], [360, 56, "2"], [420, 42, "0"], [480, 28, "0"],
		[580, 70, "0"], [640, 42, "2"], [700, 28, "3"], [760, 14, "2"],
		[840, 84, "1"], [900, 56, "3"], [960, 42, "3"], [1020, 28, "1"],
		[1100, 70, "2"], [1160, 42, "4"], [1220, 28, "4"], [1280, 14, "2"],
		[1370, 84, "0"], [1430, 56, "1"], [1490, 42, "0"], [1550, 28, "2"],
	],
};

function TabStripSvg({ spec }: { spec: TabStripSpec }) {
	return (
		<svg
			width="1600"
			height="90"
			viewBox="0 0 1600 90"
			xmlns="http://www.w3.org/2000/svg"
			className="flex-none"
		>
			<g stroke={spec.line} strokeWidth="1">
				{TAB_LINES_Y.map((y) => (
					<line key={`line-${y}`} x1="0" y1={y} x2="1600" y2={y} />
				))}
				{spec.barlines.map((x) => (
					<line key={`bar-${x}`} x1={x} y1="10" x2={x} y2="80" />
				))}
			</g>
			<g fontFamily="var(--mono)" fontSize="12" fill={spec.num}>
				{spec.notes.map(([x, y, fret]) => (
					<text key={`note-${x}`} x={x} y={y}>
						{fret}
					</text>
				))}
			</g>
		</svg>
	);
}

/* Feature cards (component-patterns §3, icon recipes additional-components §11) */

interface Feature {
	tag: string;
	title: string;
	description: string;
	icon: ReactNode;
}

const ICON_PROPS = {
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	strokeWidth: 1.5,
	strokeLinecap: "square",
	"aria-hidden": true,
} as const;

const FEATURES: readonly Feature[] = [
	{
		tag: "TOOL_01",
		title: "Strumming Machine",
		description:
			"Program down, up, and muted strums on a step grid. Real sampled acoustic guitar with a metronome that subdivides down to sixteenths. Save your own patterns.",
		icon: (
			<svg {...ICON_PROPS}>
				<path className="stroke-denim-accent" d="M4 6h16M4 12h16M4 18h16" />
				<path className="stroke-ink" d="M8 3v6M14 9v6M8 15v6" />
			</svg>
		),
	},
	{
		tag: "TOOL_02",
		title: "Fingerpicking Player",
		description:
			"Full TAB notation with a live playback cursor. Loop a passage, drag the tempo mid-playback, tap anywhere to seek. Travis picking to Celtic fingerstyle, built in.",
		icon: (
			<svg {...ICON_PROPS}>
				<path className="stroke-denim-accent" d="M3 7h18M3 12h18M3 17h18" />
				<circle className="stroke-ink" cx="8" cy="7" r="2" />
				<circle className="stroke-ink" cx="15" cy="12" r="2" />
				<circle className="stroke-ink" cx="11" cy="17" r="2" />
			</svg>
		),
	},
	{
		tag: "TOOL_03",
		title: "Chord Library",
		description:
			"Every root, every suffix, every voicing — with diagrams you can hear. Tap a shape to play it back with real string-by-string sample audio before you commit fingers to frets.",
		icon: (
			<svg {...ICON_PROPS}>
				<path className="stroke-denim-accent" d="M5 3v18M9 3v18M13 3v18M17 3v18" />
				<path className="stroke-ink" d="M3 8h18M3 15h18" />
				<circle className="fill-denim" cx="9" cy="8" r="1.8" stroke="none" />
				<circle className="fill-denim" cx="13" cy="15" r="1.8" stroke="none" />
			</svg>
		),
	},
];

const HERO_META: readonly { value: string; label: string }[] = [
	{ value: "2,000+", label: "CHORD VOICINGS" },
	{ value: "REAL", label: "GUITAR SAMPLES" },
	{ value: "40–220", label: "BPM RANGE" },
	{ value: "FREE", label: "IN THE BROWSER" },
];

export default function Home() {
	return (
		<div className="flex min-h-full flex-col">
			<NavBar />

			<main>
				{/* Hero */}
				<section className="relative flex min-h-[92vh] items-center overflow-hidden border-b border-line">
					{/* Animated TAB notation background — confirmed keeper, do not shrink */}
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-16 opacity-50 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]"
					>
						<div className="flex w-max animate-[tabscroll_60s_linear_infinite] motion-reduce:animate-none">
							<TabStripSvg spec={STRIP_FRONT} />
							<TabStripSvg spec={STRIP_FRONT} />
						</div>
						<div className="flex w-max animate-[tabscroll-rev_80s_linear_infinite] motion-reduce:animate-none">
							<TabStripSvg spec={STRIP_BACK} />
							<TabStripSvg spec={STRIP_BACK} />
						</div>
					</div>

					<div className="relative z-2 mx-auto w-full max-w-[1200px] px-8 pt-35 pb-25 max-sm:px-5 max-sm:pt-30 max-sm:pb-20">
						{/* Hero badge — the landing page's one LED (system online) */}
						<span
							className={`${EYEBROW} inline-flex items-center gap-2.5 border border-[rgba(74,111,165,0.45)] px-3.5 py-2`}
						>
							<span
								aria-hidden="true"
								className="size-1.5 flex-none animate-[ledbreathe_2.4s_ease-in-out_infinite] rounded-full bg-denim-accent shadow-[var(--glow-led)] motion-reduce:animate-none"
							/>
							Practice studio for self-taught guitarists
						</span>

						<h1 className="mt-5 max-w-[14ch] font-mono text-[length:var(--text-hero-size)] leading-[var(--text-hero-lh)] font-bold tracking-[var(--text-hero-ls)]">
							Guitar practice,{" "}
							<span className="text-denim-accent">engineered.</span>
							<span
								aria-hidden="true"
								className="inline-block h-[0.9em] w-[0.55ch] animate-[blink_1.1s_steps(1)_infinite] bg-denim align-text-bottom motion-reduce:animate-none"
							/>
						</h1>

						<p className="mt-7 max-w-[52ch] text-[length:var(--text-body-lede)] text-ink-dim">
							Strumming machine, fingerpicking TAB player, and a full chord
							library — one precise, no-nonsense workspace for building real
							technique. No streaks. No gamification. Just the tools.
						</p>

						<div className="mt-11 flex flex-wrap gap-4">
							<Link href="/strum" className={BTN_PRIMARY}>
								Start practicing →
							</Link>
							<Link href="/chords" className={BTN_GHOST}>
								Browse chords
							</Link>
						</div>

						<div className="mt-18 flex gap-12 font-mono text-xs tracking-[0.06em] text-ink-faint max-sm:mt-14 max-sm:flex-col max-sm:gap-3">
							{HERO_META.map(({ value, label }) => (
								<span key={label}>
									<b className="font-medium text-ink-dim">{value}</b> {label}
								</span>
							))}
						</div>
					</div>
				</section>

				{/* Features */}
				<section className="border-b border-line py-[110px] max-sm:py-20">
					<div className="mx-auto max-w-[1200px] px-8 max-sm:px-5">
						<div className="mb-16">
							<span className={EYEBROW}>{"// Toolkit"}</span>
							<h2 className="mt-3.5 font-mono text-[length:var(--text-h2-size)] font-bold tracking-[var(--text-h2-ls)]">
								Three instruments.
								<br />
								One interface.
							</h2>
						</div>
						<div className="grid grid-cols-3 border border-line max-[900px]:grid-cols-1">
							{FEATURES.map(({ tag, title, description, icon }) => (
								<div
									key={tag}
									className="group relative border-r border-line px-8 pt-10 pb-12 transition-colors duration-200 last:border-r-0 hover:bg-raise max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:last:border-b-0"
								>
									<span className="absolute top-4 right-4 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-faint">
										{/* Dormant LED powers on with the card — teaches LED = active */}
										<span
											aria-hidden="true"
											className="size-1.5 flex-none rounded-full bg-ink-faint transition-[background-color,box-shadow] duration-200 group-hover:bg-denim-accent group-hover:shadow-[var(--glow-led)]"
										/>
										{tag}
									</span>
									<div className="mb-7 flex size-12 items-center justify-center border border-line-strong transition-colors duration-200 group-hover:border-denim">
										{icon}
									</div>
									<h3 className="mb-3 font-mono text-[length:var(--text-h3-size)] font-medium tracking-[0.02em]">
										{title}
									</h3>
									<p className="text-[length:var(--text-body-card)] text-ink-dim">
										{description}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* CTA band — no bottom border by design */}
				<section className="py-[110px] max-sm:py-20">
					<div className="mx-auto max-w-[1200px] px-8 max-sm:px-5">
						<span className={EYEBROW}>{"// No install. No account required."}</span>
						<h2 className="mt-4 max-w-[22ch] font-mono text-[clamp(26px,3.6vw,44px)] font-bold tracking-[var(--text-h2-ls)]">
							Open the browser.
							<br />
							Pick up the guitar.
						</h2>
						<Link href="/strum" className={`${BTN_PRIMARY} mt-9`}>
							Launch Guitar Pal →
						</Link>
					</div>
				</section>
			</main>

			{/* Footer — no LEDs by design */}
			<footer className="border-t border-line pt-9 pb-12 font-mono text-[11.5px] tracking-[0.06em] text-ink-faint">
				<div className="mx-auto flex max-w-[1200px] flex-wrap items-baseline justify-between gap-6 px-8 max-sm:px-5">
					<span>GUITAR_PAL © {new Date().getFullYear()}</span>
					<div className="flex gap-6">
						<Link href="/strum" className={FOOTER_LINK}>
							STRUM
						</Link>
						<Link href="/fingerpick" className={FOOTER_LINK}>
							FINGERPICK
						</Link>
						<Link href="/chords" className={FOOTER_LINK}>
							CHORDS
						</Link>
						<a
							href="https://github.com/SloanWan/guitar-pal"
							target="_blank"
							rel="noopener noreferrer"
							className={FOOTER_LINK}
						>
							GITHUB
						</a>
					</div>
					<span>BUILT WITH VEXFLOW / WEBAUDIOFONT</span>
				</div>
			</footer>
		</div>
	);
}
