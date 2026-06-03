import { Guitar } from "lucide-react";
import LogoutButton from "./LogoutButton";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createSupabaseServer } from "@/lib/supabase-server";

export default async function NavBar() {
	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	return (
		<header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
				<Link href="/dashboard" className="flex items-center gap-2">
					<div className="flex items-center justify-center size-7 rounded-lg bg-amber-100 text-amber-700">
						<Guitar className="size-4" />
					</div>
					<span className="font-semibold text-sm tracking-tight">Guitar Pal</span>
				</Link>
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="lg" className="sm:px-8">
						<Link href="/chords">Chords Library</Link>
					</Button>
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
	);
}
