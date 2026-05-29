import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Music, Guitar } from "lucide-react";

export default function Home() {
	return (
		<div className="flex flex-col flex-1 items-center justify-center bg-background px-4">
			<main className="flex flex-col items-center gap-8 text-center">
				<div className="flex items-center justify-center size-16 rounded-2xl bg-amber-100 text-amber-700">
					<Guitar className="size-8" />
				</div>
				<div className="space-y-3">
					<h1 className="text-4xl font-semibold tracking-tight">Guitar Pal</h1>
					<p className="text-muted-foreground text-base max-w-xs leading-relaxed">
						Build your guitar practice, one routine at a time.
					</p>
				</div>
				<div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
					<Button asChild size="lg" className="sm:px-8">
						<Link href="/auth">Sign in</Link>
					</Button>
					<Button asChild variant="outline" size="lg" className="sm:px-8">
						<Link href="/auth">Create account</Link>
					</Button>
				</div>
			</main>
		</div>
	);
}
