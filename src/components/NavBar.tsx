import LogoutButton from "./LogoutButton";
import NavLinks from "./NavLinks";
import ThemeToggle from "./ThemeToggle";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import NavBarScrollWrapper from "./NavBarScrollWrapper";

export default async function NavBar() {
	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	return (
		<NavBarScrollWrapper>
		<header className="h-12 flex-none border-b border-line bg-panel">
			<div className="mx-auto grid h-full w-full max-w-300 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-(--gutter)">
				<Link
					href="/"
					className="flex min-w-0 items-center gap-2 justify-self-start text-ink focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
				>
					{/* Guitar Pal mark: strings inherit text color via currentColor;
					    the playhead rect stays denim in both themes (the one
					    permitted hardcoded hex in the token system). */}
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
					<span className="hidden font-mono text-[13px] font-bold tracking-[0.06em] nav:block">
						GUITAR_PAL
					</span>
				</Link>
				<NavLinks />
				<div className="flex min-w-0 items-center gap-3 justify-self-end">
					<ThemeToggle />
					{user ? (
						<>
							<span className="hidden min-w-0 truncate font-mono text-[11px] tracking-[0.04em] text-ink-faint md:block">
								{user?.email}
							</span>
							<LogoutButton />
						</>
					) : (
						// Single nav-CTA: transparent, denim border, denim-accent
						// text; hover fills denim; :active press-flashes denim-tint.
						// Sign-up stays reachable via the auth page tabs.
						<Link
							href="/auth"
							className="border border-denim bg-transparent px-[18px] py-2 font-mono text-xs uppercase tracking-[0.08em] text-denim-accent transition-[color,background-color,border-color,transform,translate] duration-(--dur-hover) ease-out hover:bg-denim hover:text-on-denim motion-safe:active:translate-y-px active:bg-denim-tint active:text-denim-accent active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
						>
							Sign In
						</Link>
					)}
				</div>
			</div>
		</header>
		</NavBarScrollWrapper>
	);
}
