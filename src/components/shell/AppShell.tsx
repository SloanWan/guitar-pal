import { createSupabaseServer } from "@/lib/supabase-server";
import { profileOf } from "@/lib/profile";
import BrandLink from "@/components/BrandLink";
import SignInLink from "@/components/SignInLink";
import ThemeToggle from "@/components/ThemeToggle";
import UserMenu from "@/components/UserMenu";
import AssistantLauncher from "@/components/assistant/AssistantLauncher";
import { Button } from "@/components/ui/button";
import NavLinks from "./NavLinks";
import MoreMenu from "./MoreMenu";
import TabBar from "./TabBar";
import PointerFocusRelease from "./PointerFocusRelease";

/**
 * The page's frame (#356): the header, the page between, and the phone tab bar under it.
 * One header serves every width — on a phone it is the 52px app bar (brand, Ask, ⋯ More),
 * from 720px the 56px header (brand, nav, Ask, account). The tab bar closes the column
 * below 720px, after <main>, so it never sits over content.
 *
 * `hideSignIn` is for the sign-in page itself, where a "Sign in" button would point at
 * the page the visitor is already on.
 */
export default async function AppShell({ hideSignIn = false, children }: { hideSignIn?: boolean; children: React.ReactNode }) {
	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	// Resolved here, on the server, so the client surfaces receive a small view
	// model rather than the whole auth user.
	const profile = user ? profileOf(user) : null;

	return (
		<>
			<header className="gp-header">
				<div className="gp-header-in">
					{/* The pick mark (#352). Its gap hairline takes the header colour so the
					    overlapping picks stay apart at this size. */}
					<BrandLink className="flex min-w-0 flex-none items-center gap-2 rounded-gp-sm text-gp-ink [--mk-gap:var(--gp-page)] focus-visible:outline-none" />
					<NavLinks className="gp-wide-only" />
					<div className="gp-header-end">
						{/* The assistant sits just left of the account at every width — a
						    primary entry point, never collapsed into a menu. */}
						<AssistantLauncher />
						{profile ? (
							<UserMenu profile={profile} className="gp-wide-only" />
						) : (
							<>
								<ThemeToggle className="gp-wide-only" />
								{!hideSignIn && (
									<Button variant="ink" size="sm" asChild className="gp-wide-only">
										<SignInLink>Sign in</SignInLink>
									</Button>
								)}
							</>
						)}
						<MoreMenu signedIn={!!profile} hideSignIn={hideSignIn} className="gp-phone-only" />
					</div>
				</div>
			</header>
			{children}
			<TabBar signedIn={!!profile} />
			<PointerFocusRelease />
		</>
	);
}
