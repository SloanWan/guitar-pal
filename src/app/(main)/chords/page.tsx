import { createSupabaseServer } from "@/lib/supabase-server";
import ChordsView from "@/components/ChordsView";

export default async function ChordsPage() {
	const supabase = await createSupabaseServer();

	const { data: allChords } = await supabase.from("chords").select("root, suffix").order("root");

	const { data: initialChord } = await supabase
		.from("chords")
		.select(
			`
      id, root, suffix,
      chord_voicings (
        id, label, start_fret, barre_fret, capo, frets, fingers
      )
    `,
		)
		.eq("root", "C")
		.eq("suffix", "major")
		.single();

	const roots = [...new Set(allChords?.map((c) => c.root) ?? [])];
	const rootSuffixMap =
		allChords?.reduce(
			(acc, chord) => {
				if (!acc[chord.root]) {
					acc[chord.root] = [];
				}
				acc[chord.root].push(chord.suffix);
				return acc;
			},
			{} as Record<string, string[]>,
		) ?? {};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto py-8 text-center">
				{/* <h1 className="text-4xl font-bold mb-8">Guitar Chords</h1> */}
				<ChordsView
					initialChord={initialChord}
					roots={roots}
					rootSuffixMap={rootSuffixMap}
				/>
			</div>
		</div>
	);
}
