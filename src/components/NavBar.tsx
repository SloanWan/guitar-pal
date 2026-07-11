import LogoutButton from "./LogoutButton";
import NavLinks from "./NavLinks";
import ThemeToggle from "./ThemeToggle";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import NavBarScrollWrapper from "./NavBarScrollWrapper";

const authLinkBase =
	"border px-[18px] py-2 font-mono text-xs uppercase tracking-[0.08em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1";

export default async function NavBar() {
	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	return (
		<NavBarScrollWrapper>
		<header className="h-12 flex-none border-b border-line bg-panel">
			<div className="flex h-full items-center gap-5 px-4">
				<Link
					href="/"
					className="flex items-center gap-2 text-ink focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
				>
					{/* Guitar Pal mark: strings inherit text color via currentColor;
					    the playhead rect stays denim in both themes (the one
					    permitted hardcoded hex in the token system). */}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						className="size-[18px]"
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
					<span className="hidden font-mono text-[13px] font-bold tracking-[0.06em] sm:block">
						GUITAR_PAL
					</span>
					<span
						className="ml-0.5 size-1.5 rounded-full bg-denim-accent shadow-[var(--glow-led)]"
						aria-hidden="true"
					/>
				</Link>
				<NavLinks />
				<div className="ml-auto flex items-center gap-3">
					<ThemeToggle />
					{user ? (
						<>
							<span className="hidden font-mono text-[11px] tracking-[0.04em] text-ink-faint md:block">
								{user?.email}
							</span>
							<LogoutButton />
						</>
					) : (
						<div className="flex flex-row gap-3">
							<Link
								href="/auth"
								className={`${authLinkBase} border-denim bg-denim text-on-denim hover:border-denim-accent hover:bg-denim-accent active:border-denim-accent active:bg-denim-accent`}
							>
								Log In
							</Link>
							<Link
								href="/auth"
								className={`${authLinkBase} border-line-strong text-ink hover:border-denim hover:text-denim-accent active:border-denim active:bg-denim-tint`}
							>
								Sign Up
							</Link>
						</div>
					)}
				</div>
			</div>
		</header>
		</NavBarScrollWrapper>
	);
}
