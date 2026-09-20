import NavLinks from "./NavLinks";
import NavBarMenu from "./NavBarMenu";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";
import Link from "@/components/AppLink";
import SignInLink from "./SignInLink";
import { createSupabaseServer } from "@/lib/supabase-server";
import { profileOf } from "@/lib/profile";
import AssistantLauncher from "./assistant/AssistantLauncher";

/**
 * `hideSignIn` is for the sign-in page itself, where a "Sign In" CTA in the
 * topbar would point at the page the visitor is already on. The signed-out
 * cluster then keeps only the theme toggle, at every width.
 */
export default async function NavBar({ hideSignIn = false }: { hideSignIn?: boolean } = {}) {
	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	// Resolved here, on the server, so the client surfaces receive a small view
	// model rather than the whole auth user.
	const profile = user ? profileOf(user) : null;

	return (
		<div className="sticky top-0 z-10">
			<header className="h-13 flex-none border-b border-line bg-topbar">
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
						{/* The assistant sits just left of the account control at every
						    width — a primary entry point, never collapsed into a menu. */}
						<AssistantLauncher />
						{profile ? (
							// Signed in: the avatar menu is the rightmost control at every
							// width and carries theme + sign-out itself, so no collapse menu.
							<UserMenu profile={profile} />
						) : hideSignIn ? (
							<ThemeToggle />
						) : (
							<>
								{/* ≥ nav: signed-out controls sit inline in the topbar. */}
								<div className="hidden items-center gap-3 nav:flex">
									<ThemeToggle />
									{/* Single nav-CTA: transparent, denim border, denim-accent
									    text; hover fills denim; :active press-flashes denim-tint.
									    Sign-up stays reachable via the auth page tabs. */}
									<SignInLink
										className="flex h-(--h-control) items-center border border-denim bg-transparent px-4.5 font-mono text-xs uppercase tracking-[0.08em] text-denim-accent transition-[color,background-color,border-color,transform,translate] duration-(--dur-hover) ease-out hover:bg-denim hover:text-on-denim motion-safe:active:translate-y-px active:bg-denim-tint active:text-denim-accent active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
									/>
								</div>
								{/* < nav: the toggle + sign-in collapse into one menu trigger. */}
								<div className="nav:hidden">
									<NavBarMenu />
								</div>
							</>
						)}
					</div>
				</div>
			</header>
		</div>
	);
}
