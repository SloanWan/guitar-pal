import { notFound } from "next/navigation";
import Link from "next/link";

// Single source of truth for whether the /dev tool area exists. When the flag
// is unset (production), the whole subtree 404s here — proxy.ts deliberately
// leaves /dev alone in that case so the route's existence isn't leaked via a redirect.
export default function DevLayout({ children }: { children: React.ReactNode }) {
	if (process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES !== "1") notFound();

	return (
		<>
			<div className="fixed inset-x-0 top-0 z-50 flex h-8 items-center gap-4 border-b border-line bg-denim-tint px-(--gutter) font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent">
				<span className="font-bold">DEV ONLY — not available in production</span>
				<Link
					href="/dev"
					className="transition-colors duration-(--dur-hover) hover:text-ink"
				>
					/dev
				</Link>
				<Link
					href="/"
					className="transition-colors duration-(--dur-hover) hover:text-ink"
				>
					/
				</Link>
			</div>
			{/* Offset for the fixed banner so page content isn't hidden beneath it. */}
			<div className="pt-8">{children}</div>
		</>
	);
}
