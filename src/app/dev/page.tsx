import Link from "next/link";

// Plain index of every route under /dev. Kept as a hand-maintained list rather
// than filesystem introspection — it's a dev-only convenience, not a feature.
interface DevRoute {
	href: string;
	label: string;
	description: string;
}

const DEV_ROUTES: readonly DevRoute[] = [
	{
		href: "/dev/dashboard",
		label: "dashboard",
		description: "Practice dashboard — routines, exercises, and practice logs.",
	},
	{
		href: "/dev/dashboard",
		label: "session",
		description:
			"Practice session runner at /dev/session/[routineId] — start one from the dashboard's Start button.",
	},
	{
		href: "/dev/audio-sample",
		label: "audio-sample",
		description: "Preset loader and A/B audio comparison for pitch-quality audits.",
	},
	{
		href: "/dev/chord-diagram",
		label: "chord-diagram",
		description: "Chord diagram SVG rendering showcase across dot styles and card states.",
	},
	{
		href: "/dev/decay-lab",
		label: "decay-lab",
		description: "Fingerpick note-decay envelope and voice-stealing lab.",
	},
	{
		href: "/dev/design-system",
		label: "design-system",
		description: "v3 DAW-aesthetic component audit — faders, rockers, LEDs, BPM readouts.",
	},
	{
		href: "/dev/muted-preset-audition",
		label: "muted-preset-audition",
		description: "A/B audition of muted-note presets across guitar voicings.",
	},
	{
		href: "/dev/roll-lab",
		label: "roll-lab",
		description: "Fingerpick roll technique lab — stagger, gap, and anchor modes.",
	},
	{
		href: "/dev/slide-lab",
		label: "slide-lab",
		description: "Fingerpick slide technique lab — duration scaling, anchors, legato.",
	},
	{
		href: "/dev/strum-preset-audition",
		label: "strum-preset-audition",
		description: "A/B audition of strum presets across pitch ranges.",
	},
	{
		href: "/dev/tab-notation",
		label: "tab-notation",
		description: "VexFlow TAB rendering audit using real fingerpick patterns.",
	},
];

export default function DevIndexPage() {
	return (
		<div className="min-h-screen bg-surface px-(--gutter) py-10 text-ink">
			<header className="pb-8">
				<div className="font-mono text-[11px] uppercase tracking-[0.18em] text-denim-accent">
					{"// DEV — TOOL HUB"}
				</div>
				<h1
					className="mt-3 font-mono font-bold text-ink"
					style={{ fontSize: "clamp(28px, 4vw, 44px)" }}
				>
					Dev routes
				</h1>
				<p className="mt-3 max-w-[60ch] font-sans text-[14px] text-ink-dim">
					Internal tools and auditions. This area only exists when
					NEXT_PUBLIC_ENABLE_DEV_ROUTES=1 and is unavailable in production.
				</p>
			</header>

			<ul className="divide-y divide-line border-y border-line">
				{DEV_ROUTES.map((route) => (
					<li key={route.label}>
						<Link
							href={route.href}
							className="flex flex-col gap-1 py-3 transition-colors duration-(--dur-hover) hover:bg-denim-tint sm:flex-row sm:items-baseline sm:gap-4"
						>
							<span className="min-w-56 font-mono text-[13px] font-medium text-denim-accent">
								/dev/{route.label}
							</span>
							<span className="font-sans text-[13px] text-ink-dim">
								{route.description}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
