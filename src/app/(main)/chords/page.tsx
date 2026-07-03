import { createSupabaseServer } from "@/lib/supabase-server";
import ChordsView from "@/components/chords/ChordsView";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

export default async function ChordsPage() {
	const supabase = await createSupabaseServer();

	const { data: allChords } = await supabase.from("chords").select("root, suffix").order("root");

	const { data: initialChordRaw } = await supabase
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
				if (!acc[chord.root]) acc[chord.root] = [];
				acc[chord.root].push(chord.suffix);
				return acc;
			},
			{} as Record<string, string[]>,
		) ?? {};

	const initialChord = initialChordRaw
		? {
				id: initialChordRaw.id,
				root: initialChordRaw.root,
				suffix: initialChordRaw.suffix,
				chord_voicings: initialChordRaw.chord_voicings as ChordVoicing[],
			}
		: undefined;

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto py-8">
				<ChordsView
					initialChord={initialChord}
					roots={roots}
					rootSuffixMap={rootSuffixMap}
				/>
			</div>
		</div>
	);
}
