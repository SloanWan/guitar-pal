import type { Metadata } from "next";
import Link from "@/components/AppLink";
import AppShell from "@/components/shell/AppShell";
import ModuleMain from "@/components/ModuleMain";
import StatusScreen, { StatusTab } from "@/components/status/StatusScreen";
import NotFoundVideo from "@/components/status/NotFoundVideo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found · Guitar Pal" };

/* "4 0 4" written as frets, on the B, G and D strings. */
const FRETS = [
	[88, 2, "4"],
	[136, 3, "0"],
	[184, 4, "4"],
] as const;

/**
 * Every unmatched URL and every `notFound()`. It renders inside the root
 * layout only — the route groups' layouts are what it replaces — so it brings
 * the shell itself: the header and the phone tab bar are the way out.
 */
export default function NotFound() {
	return (
		<AppShell>
			<ModuleMain className="flex-1 min-h-0 overflow-y-auto">
				<StatusScreen
					art={<StatusTab notes={FRETS} />}
					title="You've hit a dead fret."
					lead="This page doesn't exist, and Khalil has nothing to say about it."
				>
					<NotFoundVideo />
					<Button asChild>
						<Link href="/">Back to Guitar Pal</Link>
					</Button>
				</StatusScreen>
			</ModuleMain>
		</AppShell>
	);
}
