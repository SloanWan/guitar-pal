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
		[30, 84, "3"],
		[70, 42, "0"],
		[110, 28, "1"],
		[150, 14, "0"],
		[240, 70, "2"],
		[280, 56, "2"],
		[320, 42, "0"],
		[360, 28, "1"],
		[430, 84, "0"],
		[470, 56, "2"],
		[510, 28, "1"],
		[550, 14, "0"],
		[640, 70, "3"],
		[680, 42, "0"],
		[720, 28, "0"],
		[760, 56, "2"],
		[830, 84, "5"],
		[870, 42, "7"],
		[910, 28, "5"],
		[950, 14, "7"],
		[1040, 70, "2"],
		[1080, 56, "4"],
		[1120, 42, "2"],
		[1160, 28, "3"],
		[1230, 84, "0"],
		[1270, 42, "2"],
		[1310, 28, "3"],
		[1350, 56, "2"],
		[1440, 70, "2"],
		[1480, 42, "0"],
		[1520, 28, "1"],
		[1560, 14, "0"],
	],
};

const STRIP_BACK: TabStripSpec = {
	line: "var(--tab-line-2)",
	num: "var(--tab-num-2)",
	barlines: [266, 533, 800, 1066, 1333, 1599],
	notes: [
		[40, 56, "0"],
		[100, 42, "2"],
		[160, 28, "2"],
		[220, 14, "0"],
		[300, 84, "3"],
		[360, 56, "2"],
		[420, 42, "0"],
		[480, 28, "0"],
		[580, 70, "0"],
		[640, 42, "2"],
		[700, 28, "3"],
		[760, 14, "2"],
		[840, 84, "1"],
		[900, 56, "3"],
		[960, 42, "3"],
		[1020, 28, "1"],
		[1100, 70, "2"],
		[1160, 42, "4"],
		[1220, 28, "4"],
		[1280, 14, "2"],
		[1370, 84, "0"],
		[1430, 56, "1"],
		[1490, 42, "0"],
		[1550, 28, "2"],
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
	href: string;
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
		title: "Strum Machine",
		description:
			"Real guitar samples, tap tempo, and a genre-tuned BPM dial — practice strum patterns that actually sound like a guitar.",
		href: "/strum",
		icon: (
			<svg {...ICON_PROPS}>
				<path className="stroke-denim-accent" d="M4 6h16M4 12h16M4 18h16" />
				<path className="stroke-ink" d="M8 3v6M14 9v6M8 15v6" />
			</svg>
		),
	},
	{
		tag: "TOOL_02",
		title: "Fingerpick Studio",
		description:
			"A TAB player with hammer-ons, pull-offs, and slides rendered note by note. Follow the cursor, loop any passage, slow it down.",
		href: "/fingerpick",
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
			"Every open and barre voicing across all 12 roots — played back string by string so you can hear it before you fret it.",
		href: "/chords",
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
	{ value: "2,200+", label: "CHORD VOICINGS" },
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
						className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-16 opacity-50 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)] mask-[linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]"
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

					<div className="relative z-2 mx-auto w-full max-w-300 px-(--gutter) pt-5 pb-8 max-sm:pt-18 max-sm:pb-20">
						{/* Hero badge — the landing page's one LED (system online) */}
						<span
							className={`${EYEBROW} inline-flex items-center gap-2.5 border border-[rgba(74,111,165,0.45)] px-3.5 py-2`}
						>
							<span
								aria-hidden="true"
								className="size-1.5 flex-none animate-[ledbreathe_2.4s_ease-in-out_infinite] rounded-full bg-denim-accent shadow-(--glow-led) motion-reduce:animate-none"
							/>
							Practice studio for self-taught guitarists
						</span>

						<h1 className="mt-5 max-w-[14ch] font-mono text-(length:--text-hero-size) leading-(--text-hero-lh) font-bold tracking-(--text-hero-ls)">
							Guitar practice, <span className="text-denim-accent">engineered.</span>
							<span
								aria-hidden="true"
								className="inline-block h-[0.9em] w-[0.55ch] animate-[blink_1.1s_steps(1)_infinite] bg-denim align-text-bottom motion-reduce:animate-none"
							/>
						</h1>

						<p className="mt-7 max-w-[52ch] text-(length:--text-body-lede) text-ink-dim">
							Strumming machine, fingerpicking TAB player, and a full chord library —
							one precise, no-nonsense workspace for building real technique. No
							streaks. No gamification. Just the tools.
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
				<section className="border-b border-line py-27.5 max-sm:py-20">
					<div className="mx-auto max-w-300 px-(--gutter)">
						<div className="mb-16">
							<span className={EYEBROW}>{"// Toolkit"}</span>
							<h2 className="mt-3.5 font-mono text-(length:--text-h2-size) font-bold tracking-(--text-h2-ls)">
								Three instruments.
								<br />
								One interface.
							</h2>
						</div>
						<div className="grid grid-cols-3 border border-line max-[900px]:grid-cols-1">
							{FEATURES.map(({ tag, title, description, href, icon }) => (
								<Link
									key={tag}
									href={href}
									className="group relative block border-r border-line px-8 pt-10 pb-12 transition-colors duration-200 last:border-r-0 hover:bg-raise focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-denim-accent max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:last:border-b-0"
								>
									<span className="absolute top-4 right-4 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-faint">
										{/* Dormant LED powers on with the card — teaches LED = active */}
										<span
											aria-hidden="true"
											className="size-1.5 flex-none rounded-full bg-ink-faint transition-[background-color,box-shadow] duration-200 group-hover:bg-denim-accent group-hover:shadow-(--glow-led)"
										/>
										{tag}
									</span>
									<div className="mb-7 flex size-12 items-center justify-center border border-line-strong transition-colors duration-200 group-hover:border-denim">
										{icon}
									</div>
									<h3 className="mb-3 font-mono text-(length:--text-h3-size) font-medium tracking-[0.02em]">
										{title}
									</h3>
									<p className="text-(length:--text-body-card) text-ink-dim">
										{description}
									</p>
								</Link>
							))}
						</div>
					</div>
				</section>

				{/* CTA band — no bottom border by design */}
				<section className="py-27.5 max-sm:py-20">
					<div className="mx-auto max-w-300 px-(--gutter)">
						<span className={EYEBROW}>{"// Free account, no install"}</span>
						<h2 className="mt-4 max-w-[22ch] font-mono text-[clamp(26px,3.6vw,44px)] font-bold tracking-(--text-h2-ls)">
							Save your patterns.
							<br />
							Practice from any browser.
						</h2>
						<p className="mt-6 max-w-[56ch] text-(length:--text-body-lede) text-ink-dim">
							Guitar Pal runs entirely in the browser — no downloads, no plugins.
							Create a free account to save custom strum and fingerpick patterns, mark
							favourites, and pick up practice from any device.
						</p>
						<Link href="/auth" className={`${BTN_PRIMARY} mt-9`}>
							Create Free Account →
						</Link>
					</div>
				</section>
			</main>

			{/* Footer — no LEDs by design */}
			<footer className="border-t border-line font-mono text-[11.5px] tracking-[0.06em] text-ink-faint">
				<div className="mx-auto grid max-w-300 grid-cols-[1.6fr_1fr_1.2fr] gap-10 px-(--gutter) pt-14 pb-10 max-[900px]:grid-cols-2 max-sm:grid-cols-1 max-sm:gap-9 max-sm:pt-10">
					{/* Brand */}
					<div className="max-w-[34ch] max-[900px]:col-span-2 max-sm:col-span-1">
						<span className="flex items-center gap-2 text-ink">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								className="size-6"
								aria-hidden="true"
							>
								<path
									d="M3 4h18M3 7.2h18M3 10.4h18M3 13.6h18M3 16.8h18M3 20h18"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="square"
								/>
								<rect x="14" y="2" width="2" height="20" fill="#4A6FA5" />
							</svg>
							<span className="text-[13px] font-bold tracking-[0.06em]">
								GUITAR_PAL
							</span>
						</span>
						<p className="mt-4 max-w-[30ch] leading-relaxed text-ink-dim">
							A browser-based practice studio for self-taught guitarists.
						</p>
					</div>

					{/* Product */}
					<nav aria-label="Product">
						<span className="mb-4 block text-[10px] uppercase tracking-[0.14em] text-ink-faint">
							Product
						</span>
						<ul className="flex flex-col gap-3 text-ink-dim">
							<li>
								<Link href="/chords" className={FOOTER_LINK}>
									Chords
								</Link>
							</li>
							<li>
								<Link href="/strum" className={FOOTER_LINK}>
									Strum
								</Link>
							</li>
							<li>
								<Link href="/fingerpick" className={FOOTER_LINK}>
									Fingerpick
								</Link>
							</li>
							<li>
								<Link href="/dashboard" className={FOOTER_LINK}>
									Dashboard
								</Link>
							</li>
						</ul>
					</nav>

					{/* Built With — attribution reused from chords/layout.tsx */}
					<div>
						<span className="mb-4 block text-[10px] uppercase tracking-[0.14em] text-ink-faint">
							Built With
						</span>
						<ul className="flex flex-col gap-3 text-ink-dim">
							<li>
								TAB rendering via{" "}
								<a
									href="https://github.com/0xfe/vexflow"
									target="_blank"
									rel="noopener noreferrer"
									className={`text-ink ${FOOTER_LINK}`}
								>
									VexFlow
								</a>
							</li>
							<li>
								audio samples via{" "}
								<a
									href="https://github.com/surikov/webaudiofont"
									target="_blank"
									rel="noopener noreferrer"
									className={`text-ink ${FOOTER_LINK}`}
								>
									WebAudioFont
								</a>
							</li>
							<li>
								voicing data via{" "}
								<a
									href="https://github.com/tombatossals/chords-db"
									target="_blank"
									rel="noopener noreferrer"
									className={`text-ink ${FOOTER_LINK}`}
								>
									@tombatossals/chords-db
								</a>
							</li>
						</ul>
					</div>
				</div>

				{/* Bottom row */}
				<div className="border-t border-line">
					<div className="mx-auto max-w-300 px-(--gutter) py-5">© 2026 Guitar Pal</div>
				</div>
			</footer>
		</div>
	);
}
