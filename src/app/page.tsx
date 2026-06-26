import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Guitar, Rows4, Music, Timer, BookOpen } from "lucide-react";
import NavBar from "@/components/NavBar";

const features = [
	{
		icon: Rows4,
		title: "Strumming Machine",
		description:
			"Practice rhythm patterns with a built-in audio metronome. Choose from preset patterns and dial in your tempo with tap or slider.",
	},
	{
		icon: Music,
		title: "Chord Library",
		description:
			"Browse 400+ chord voicings with fingering diagrams. Filter by root and quality to find exactly what you need.",
	},
	{
		icon: Timer,
		title: "Practice Sessions",
		description:
			"Time-tracked sessions keep you focused. Work through exercises and routines with built-in per-exercise timers.",
	},
	{
		icon: BookOpen,
		title: "Progress Log",
		description:
			"Log what you practiced and review your history. Track your growth across days, weeks, and months.",
	},
];

export default function Home() {
	return (
		<div className="flex flex-col min-h-full">
			<NavBar />

			{/* Hero */}
			<section className="flex flex-col items-center justify-center text-center px-4 py-24 sm:py-36 bg-background">
				<div className="flex items-center justify-center size-16 rounded-2xl bg-denim-tint text-denim mb-8">
					<Guitar className="size-8" />
				</div>
				<h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
					Guitar Pal
				</h1>
				<p className="text-lg text-muted-foreground max-w-xs mb-10 leading-relaxed">
					Practice smarter. Play better.
				</p>
				<div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
					<Button
						asChild
						size="lg"
						className="sm:px-8 transition-all duration-200 active:scale-95"
						style={{ backgroundColor: "var(--denim)", color: "white" }}
					>
						<Link href="/strum">Try Strumming Machine →</Link>
					</Button>
					<Button
						asChild
						variant="outline"
						size="lg"
						className="sm:px-8 border-denim-border text-denim hover:bg-denim-tint hover:text-denim hover:border-denim-light transition-all duration-200 active:scale-95"
					>
						<Link href="/auth">Sign Up Free</Link>
					</Button>
				</div>
			</section>

			{/* Features */}
			<section className="bg-denim-tint/60 border-t border-denim-border px-4 py-16 sm:py-20">
				<div className="max-w-4xl mx-auto">
					<h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center text-foreground mb-12">
						Everything you need to build a practice habit
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
						{features.map(({ icon: Icon, title, description }) => (
							<div
								key={title}
								className="bg-white rounded-xl border border-denim-border p-6 transition-all duration-200 hover:shadow-md hover:border-denim-light"
							>
								<div className="flex items-center justify-center size-10 rounded-lg bg-denim-tint text-denim mb-4">
									<Icon className="size-5" />
								</div>
								<h3 className="text-base font-semibold text-foreground mb-1.5">
									{title}
								</h3>
								<p className="text-sm text-muted-foreground leading-relaxed">
									{description}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>
		</div>
	);
}
