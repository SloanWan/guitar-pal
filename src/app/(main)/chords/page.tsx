import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServer } from "@/lib/supabase-server";
import { rootToSlug } from "@/lib/chordSlug";
import { sortRoots } from "@/lib/chordSuffixes";
import MusicalText from "@/components/MusicalText";

export const metadata: Metadata = {
	title: "Guitar Chord Charts | Guitar Pal",
	description: "Browse guitar chord diagrams by root note or quality.",
};

export default async function ChordsPage() {
	const supabase = await createSupabaseServer();
	const { data } = await supabase.from("chords").select("root");
	const roots = sortRoots([...new Set(data?.map((c) => c.root) ?? [])]);

	return (
		<div className="h-full bg-background">
			<div className="container mx-auto py-8">
				<div className="flex flex-col items-center gap-10">
					<div className="flex flex-col items-center gap-2 text-center">
						<h1 className="text-2xl font-semibold">Guitar Chords</h1>
						<p className="text-sm text-muted-foreground pt-2">
							Select a root note to browse chord shapes.
						</p>
					</div>

					<div className="flex flex-wrap justify-center gap-2">
						{roots.map((root) => (
							<Link
								key={root}
								href={`/chords/${rootToSlug(root)}`}
								className="inline-flex items-center rounded-md border border-denim-border bg-denim-tint px-4 py-2 text-sm font-medium text-denim transition-colors hover:bg-denim hover:text-white"
							>
								<MusicalText text={root} />
							</Link>
						))}
					</div>

					<Link
						href="/chords/all"
						className="text-sm text-muted-foreground underline hover:text-foreground"
					>
						Browse All Chords →
					</Link>
				</div>
			</div>
		</div>
	);
}
