import Link from "@/components/AppLink";
import { FlaskConical } from "lucide-react";
import TabStripBackdrop from "@/components/TabStripBackdrop";
import StrumChapter from "@/components/landing/StrumChapter";
import FingerpickChapter from "@/components/landing/FingerpickChapter";
import ChordsChapter from "@/components/landing/ChordsChapter";
import FretboardChapter from "@/components/landing/FretboardChapter";
import { Led } from "@/components/landing/landingUi";
import type { TabStripSpec } from "@/lib/fingerpickToTabStrip";

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

/* Hero background TAB strips (additional-components §8): note positions taken
   verbatim from the mockup; the drawing lives in TabStripBackdrop. */

const STRIP_FRONT: TabStripSpec = {
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

/* What signing in adds — the chapters above are the tools, this is the shelf. */

interface AccountPerk {
	tag: string;
	title: string;
	description: string;
}

const ACCOUNT_PERKS: readonly AccountPerk[] = [
	{
		tag: "Home",
		title: "Pick up where you left off",
		description:
			"The last strum and fingerpick pattern you opened, one tap away. Favourites in two columns, strumming and fingerpicking.",
	},
	{
		tag: "Share",
		title: "Send a pattern as a link",
		description:
			"Any pattern or progression becomes a page a friend can play without an account, and import to edit if they want it.",
	},
	{
		tag: "Library",
		title: "Your patterns, your shapes",
		description:
			"Custom strum and fingerpick patterns, progressions, your own chord shapes and favourites, saved to your account and there on any device.",
	},
];

const HERO_META: readonly { value: string; label: string }[] = [
	{ value: "2,200+", label: "CHORD VOICINGS" },
	{ value: "REAL", label: "GUITAR SAMPLES" },
	{ value: "40–220", label: "BPM RANGE" },
	{ value: "FREE", label: "IN THE BROWSER" },
];

export default function Home() {
	// `/` is a fully public, statically-rendered tool hub — no auth read here, so
	// there is no per-request Supabase round-trip blocking navigation to it.
	// Identity (sign-in state) is surfaced by the NavBar, not this page.

	// The (main) layout's <main> is the scroller; min-h-full keeps the footer at
	// the bottom of a short page. The chapters compute their own progress from
	// that scroller (useChapterProgress), so nothing here reads window.scrollY.
	return (
		<div className="flex min-h-full flex-col">
			{/* NavBar is provided by (main)/layout.tsx; the semantic <main> lives
			    there too, so the hero uses a plain <div> to avoid a nested landmark. */}
			<div>
				{/* Hero */}
				<section className="relative flex min-h-[74vh] items-center overflow-hidden border-b border-line">
						{/* Animated TAB notation background — confirmed keeper, do not shrink */}
						<TabStripBackdrop front={STRIP_FRONT} back={STRIP_BACK} />

						<div className="relative z-2 mx-auto w-full max-w-300 px-(--gutter) pt-5 pb-8 max-sm:pt-10 max-sm:pb-20">
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
								A strumming machine, a fingerpicking TAB player, a chord library, a
								fretboard explorer and an assistant that reads plain English — one
								precise, no-nonsense workspace for building real technique. No streaks.
								No gamification. Just the tools.
							</p>

							<div className="mt-11 flex flex-wrap gap-4">
								<Link href="/strum" className={BTN_PRIMARY}>
									Start practicing →
								</Link>
								<Link href="#chapter-1" className={BTN_GHOST}>
									See it play
								</Link>
							</div>

							<div className="mt-18 flex gap-12 font-mono text-xs tracking-[0.06em] text-ink-faint max-sm:mt-14 max-sm:flex-col max-sm:gap-3">
								{HERO_META.map(({ value, label }) => (
									<span key={label}>
										<b className="font-medium text-ink-dim">{value}</b> {label}
									</span>
								))}
							</div>

							{/* The page's premise: scrolling plays the demos below. */}
							<div
								aria-hidden="true"
								className="mt-10 inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint"
							>
								<span className="relative h-7 w-px overflow-hidden bg-line-strong">
									<span className="absolute top-[-10px] left-0 h-2.5 w-px animate-[scrollcue_1.6s_ease-in-out_infinite] bg-denim motion-reduce:animate-none" />
								</span>
								Scroll — the page plays as you go
							</div>
						</div>
					</section>

				{/* The tools, one chapter each: scrolling drives a live demo of the page. */}
				<StrumChapter index={1} />
				<FingerpickChapter index={2} />
				<ChordsChapter index={3} />
				<FretboardChapter index={4} />

				{/* With an account */}
				<section className="relative border-b border-line py-27.5 max-sm:py-10">
					{/* Dev tool-hub entry — top-right corner, only when the flag is set
					    (NEXT_PUBLIC_ vars inline at build time). */}
					{process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === "1" && (
						<Link
							href="/dev"
							className="absolute right-(--gutter) top-4 z-10 inline-flex items-center gap-1.5 border border-denim bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent transition-colors duration-(--dur-hover) hover:bg-denim hover:text-on-denim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim-accent"
						>
							<FlaskConical className="size-3.5" strokeWidth={1.5} />
							Dev
						</Link>
					)}
					<div className="mx-auto max-w-300 px-(--gutter)">
						<span className={EYEBROW}>{"// With an account"}</span>
						<h2 className="mt-3.5 font-mono text-(length:--text-h2-size) font-bold tracking-(--text-h2-ls)">
							Sign in to keep it.
						</h2>
						<div className="mt-14 grid grid-cols-3 gap-px border border-line bg-line max-[900px]:grid-cols-1">
							{ACCOUNT_PERKS.map(({ tag, title, description }) => (
								<div key={tag} className="bg-surface px-7 pt-8 pb-9">
									<span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
										<Led />
										{tag}
									</span>
									<h3 className="mt-5 mb-2.5 font-mono text-(length:--text-h3-size) font-medium tracking-[0.02em]">
										{title}
									</h3>
									<p className="text-(length:--text-body-card) text-ink-dim">{description}</p>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* Closing CTA */}
				<section className="border-b border-line py-27.5 max-sm:py-10">
					<div className="mx-auto max-w-300 px-(--gutter)">
						<span className={EYEBROW}>{"// Ready"}</span>
						<h2 className="mt-3.5 max-w-[16ch] font-mono text-[clamp(30px,4.6vw,56px)] leading-[1.08] font-bold tracking-[-0.03em]">
							Free. In the browser. No streaks.
						</h2>
						<div className="mt-9 flex flex-wrap gap-4">
							<Link href="/strum" className={BTN_PRIMARY}>
								Start practicing →
							</Link>
							<Link href="/chords" className={BTN_GHOST}>
								Browse chords
							</Link>
						</div>
					</div>
				</section>
			</div>

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
