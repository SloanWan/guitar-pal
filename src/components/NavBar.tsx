import NavLinks from "./NavLinks";
import NavBarMenu from "./NavBarMenu";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";
import BrandLink from "./BrandLink";
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
					{/* The pick mark (#352). Its gap hairline takes the topbar colour so the
					    overlapping picks stay apart at this size. */}
					<BrandLink className="flex min-w-0 items-center gap-2 justify-self-start text-ink [--mk-gap:var(--topbar-bg)] focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1" />
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
