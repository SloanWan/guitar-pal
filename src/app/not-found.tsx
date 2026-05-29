import Link from "next/link";
import { Guitar } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-background px-4 py-12 text-center">
			{/* Icon */}
			<div className="flex items-center justify-center size-16 rounded-2xl bg-amber-100 text-amber-700 mb-6">
				<Guitar className="size-8" />
			</div>

			{/* Headline */}
			<p className="text-sm font-medium text-amber-700 tracking-widest uppercase mb-2">
				404 — String Not Found
			</p>
			<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
				You&apos;ve hit a dead fret.
			</h1>
			<p className="text-muted-foreground text-base max-w-md leading-relaxed mb-8">
				This page doesn&apos;t exist, and Khalil has nothing to say about it.
			</p>

			{/* YouTube embed — responsive */}
			<div className="w-full max-w-sm rounded-xl overflow-hidden ring-1 ring-border shadow-sm mb-8">
				<div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
					<iframe
						className="absolute inset-0 w-full h-full"
						src="https://www.youtube.com/embed/az7cnBm62bM"
						allow="autoplay; encrypted-media"
						allowFullScreen
					/>
				</div>
			</div>

			{/* CTA */}
			<Button asChild>
				<Link href="/">Back to Guitar Pal</Link>
			</Button>
		</div>
	);
}
