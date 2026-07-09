import { Guitar } from "lucide-react";
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
						<Guitar className="size-4" />
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
