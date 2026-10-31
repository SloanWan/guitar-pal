import { ArrowRight, FlaskConical, Heart, House, Link2 } from "lucide-react";
import Link from "@/components/AppLink";
import SongCard from "@/components/landing/song/SongCard";
import SongSteps from "@/components/landing/song/SongSteps";
import { SongPlayerProvider } from "@/components/landing/song/SongPlayer";
import { LateNightLine, TuningEgg } from "@/components/landing/song/Eggs";
import { Button } from "@/components/ui/button";
import { PickMark } from "@/components/ui/pick";

/* The landing page (#363 step 16, scheme D): one song walked from a sentence
   to the player's hands, every tool doing its part on the same eight bars,
   then what an account keeps. Everything shown plays: the steps read one
   player (`SongPlayer`) that drives the Strum and fingerpick engines. */

/** The page's side inset, the header's: 16px on a phone, 24px from 720px, 32px from 960px. */
const GUTTER = "px-(--gp-gutter-phone) min-[720px]:px-(--gp-gutter-tablet) min-[960px]:px-(--gp-gutter-desktop)";
const WRAP = `mx-auto w-full max-w-[1120px] ${GUTTER}`;

/* "2,200+" is the chord_voicings table (2,291 rows on 2026-09-22); the rest are the product's own limits. */
const FACTS: readonly { value: string; label: string }[] = [
	{ value: "2,200+", label: "chord voicings" },
	{ value: "Real", label: "guitar samples" },
	{ value: "40–220", label: "BPM" },
	{ value: "Plain English", label: "assistant" },
	{ value: "Free", label: "in the browser" },
];

const PERKS: readonly { icon: typeof House; title: string; text: string }[] = [
	{
		icon: House,
		title: "Pick up where you left off",
		text: "The last strum and fingerpick pattern you opened, one tap away on Home.",
	},
	{
		icon: Link2,
		title: "Send a song as a link",
		text: "Any pattern or progression becomes a page a friend can play without an account, and import to edit.",
	},
	{
		icon: Heart,
		title: "Your patterns, your shapes",
		text: "Custom patterns, progressions, your own chord shapes and favourites, on any device.",
	},
];

/* Every page the steps open, in their order; the assistant's link is the grammar it reads,
   the MCP connector's the guide to adding it (it has no page of its own). */
const FOOTER_PRODUCT: readonly { href: string; label: string; external?: boolean }[] = [
	{ href: "/strum", label: "Strum" },
	{ href: "/fingerpick", label: "Tab" },
	{ href: "/chords", label: "Chords" },
	{ href: "/fretboard", label: "Fretboard" },
	{ href: "/docs/assistant-grammar", label: "Assistant" },
	{ href: "/books/sample", label: "Books (preview)" },
	{ href: "https://github.com/SloanWan/guitar-pal/blob/main/docs/mcp.md", label: "MCP connector", external: true },
];

const CREDITS: readonly { lead: string; href: string; label: string; tail?: string }[] = [
	{ lead: "TAB rendering via", href: "https://github.com/0xfe/vexflow", label: "VexFlow" },
	{ lead: "Audio samples via", href: "https://github.com/surikov/webaudiofontdata", label: "WebAudioFont" },
	{
		lead: "Voicing data via",
		href: "https://github.com/tombatossals/chords-db",
		label: "@tombatossals/chords-db",
		tail: ", every voicing audited here",
	},
];

const FOOTER_LINK =
	"gp-focus rounded-gp-xs text-gp-ink-2 transition-colors duration-(--gp-d-state) hover:text-gp-ink";

export default function Home() {
	// `/` is public and static: no auth read here, so nothing per request blocks it.
	// The (main) layout's <main> is the scroller; min-h-full keeps the footer down.
	return (
		<div className="flex min-h-full flex-col">
			{/* Easter egg: E A D G B E on the keyboard tunes up, string by string. */}
			<TuningEgg />
			<SongPlayerProvider>
				<div className={WRAP}>
					<section className="gp-rise grid items-center gap-8 pt-14 pb-12 max-sm:pt-8 max-sm:pb-8 min-[960px]:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] min-[960px]:gap-14 min-[960px]:pt-20 min-[960px]:pb-16">
						<div className="flex flex-col items-start gap-5">
							<h1 className="font-gp-display text-(length:--gp-t-hero) leading-[1.04] font-bold tracking-[-0.025em] text-balance text-gp-ink min-[960px]:text-(length:--gp-t-hero-lg)">
								One song, all the way to your hands.
							</h1>
							<p className="max-w-[46ch] text-[17px] leading-(--gp-lh-body) text-gp-ink-2">
								Take <b className="font-semibold text-gp-ink">Birds of a Feather</b>: four shapes behind a capo on 2, one
								strum, one picking pattern. Guitar Pal walks it from a sentence to the shapes, the neck, the strum and the
								picking. Press play, and every step below follows along.
							</p>
							<LateNightLine className="-mt-2 text-(length:--gp-t-ui) text-gp-ink-3" />
							<div className="flex flex-wrap gap-3">
								<Button asChild>
									<Link href="/strum">
										Start practicing
										<ArrowRight aria-hidden />
									</Link>
								</Button>
								<Button variant="secondary" asChild>
									<Link href="/chords">Browse chords</Link>
								</Button>
							</div>
						</div>
						<SongCard />
					</section>

					<SongSteps />
				</div>
			</SongPlayerProvider>

			<div className={WRAP}>
				<ul className="flex flex-wrap gap-x-8 gap-y-2 border-t border-gp-line py-8 text-(length:--gp-t-ui) text-gp-ink-3">
					{FACTS.map(({ value, label }) => (
						<li key={label} className="whitespace-nowrap">
							<b className="font-semibold text-gp-ink">{value}</b> {label}
						</li>
					))}
				</ul>

				<section className="border-t border-gp-line py-14 max-sm:py-10">
					<h2 className="font-gp-display text-(length:--gp-t-xl) leading-(--gp-lh-head) font-bold text-gp-ink min-[960px]:text-(length:--gp-t-xl-lg)">
						Keep the song.
					</h2>
					<p className="mt-2 max-w-[52ch] text-(length:--gp-t-body) text-gp-ink-2">
						Every step above works without an account. Signing in keeps what you make.
					</p>
					<ul className="mt-7 grid gap-4 min-[720px]:grid-cols-3">
						{PERKS.map(({ icon: Icon, title, text }) => (
							<li key={title} className="flex flex-col gap-2 rounded-gp-lg bg-gp-card p-5">
								<Icon className="size-5 text-gp-ink-3" aria-hidden />
								<h3 className="font-gp-display text-[17px] font-bold text-gp-ink">{title}</h3>
								<p className="text-(length:--gp-t-ui) leading-(--gp-lh-body) text-gp-ink-2">{text}</p>
							</li>
						))}
					</ul>
				</section>

				<section className="border-t border-gp-line py-16 max-sm:py-10">
					<h2 className="max-w-[16ch] font-gp-display text-(length:--gp-t-hero) leading-[1.06] font-bold tracking-[-0.02em] text-gp-ink">
						Free. In the browser. No streaks.
					</h2>
					<div className="mt-7 flex flex-wrap gap-3">
						<Button asChild>
							<Link href="/strum">
								Start practicing
								<ArrowRight aria-hidden />
							</Link>
						</Button>
						<Button variant="secondary" asChild>
							<Link href="/chords">Browse chords</Link>
						</Button>
					</div>
				</section>
			</div>

			<footer className="mt-auto border-t border-gp-line text-(length:--gp-t-ui)">
				<div className={`${WRAP} grid gap-10 py-12 min-[720px]:grid-cols-[1.4fr_1fr_1.3fr] max-sm:py-10`}>
					<div className="flex flex-col gap-3">
						<span className="flex items-center gap-2 text-gp-ink [--mk-gap:var(--gp-page)]">
							<PickMark className="size-7 flex-none" />
							<span className="font-gp-display text-[17px] font-bold">Guitar Pal</span>
						</span>
						<p className="max-w-[30ch] text-gp-ink-3">A practice studio in the browser for self-taught guitarists.</p>
					</div>
					<nav aria-label="Product">
						<h2 className="mb-3 text-(length:--gp-t-cap) font-semibold text-gp-ink-3">Product</h2>
						<ul className="flex flex-col gap-2.5">
							{FOOTER_PRODUCT.map(({ href, label, external }) => (
								<li key={href}>
									{external ? (
										<a href={href} target="_blank" rel="noopener noreferrer" className={FOOTER_LINK}>
											{label}
										</a>
									) : (
										<Link href={href} className={FOOTER_LINK}>
											{label}
										</Link>
									)}
								</li>
							))}
							{/* Dev tools, only when the flag is set (inlined at build time). */}
							{process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === "1" && (
								<li>
									<Link href="/dev" className={`${FOOTER_LINK} inline-flex items-center gap-1.5`}>
										<FlaskConical className="size-3.5" aria-hidden />
										Dev
									</Link>
								</li>
							)}
						</ul>
					</nav>
					<div>
						<h2 className="mb-3 text-(length:--gp-t-cap) font-semibold text-gp-ink-3">Built with</h2>
						<ul className="flex flex-col gap-2.5 text-gp-ink-3">
							{CREDITS.map(({ lead, href, label, tail }) => (
								<li key={href}>
									{lead}{" "}
									<a href={href} target="_blank" rel="noopener noreferrer" className={FOOTER_LINK}>
										{label}
									</a>
									{tail}
								</li>
							))}
						</ul>
					</div>
				</div>
				<div className="border-t border-gp-line">
					<p className={`${WRAP} py-5 text-gp-ink-3`}>© 2026 Guitar Pal</p>
				</div>
			</footer>
		</div>
	);
}
