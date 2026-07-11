import { Button } from "@/components/ui/button";
import LogoutButton from "./LogoutButton";
import NavLinks from "./NavLinks";
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
		<header className="border-b border-border bg-background/80 backdrop-blur-sm">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
				<Link href="/" className="flex items-center gap-2">
					<div className="flex items-center justify-center size-7 rounded-lg bg-denim-tint text-denim">
						<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								className="size-4"
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
					</div>
					<span className="font-semibold text-sm tracking-tight hidden sm:block">
						Guitar Pal
					</span>
				</Link>
				<div className="flex items-center gap-4 nav:gap-8">
					<NavLinks />
					{user ? (
						<div className="flex items-center gap-3">
							<span className="text-sm text-muted-foreground hidden sm:block">
								{user?.email}
							</span>
							<LogoutButton />
						</div>
					) : (
						<div className="flex flex-row gap-3 w-full sm:w-auto">
							<Button asChild size="lg" className="sm:px-8">
								<Link href="/auth">Log In</Link>
							</Button>
							<Button asChild variant="outline" size="lg" className="sm:px-8">
								<Link href="/auth">Sign Up</Link>
							</Button>
						</div>
					)}
				</div>
			</div>
		</header>
		</NavBarScrollWrapper>
	);
}
