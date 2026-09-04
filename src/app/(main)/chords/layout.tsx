import { getChordIndex } from "@/lib/chordsData";
import ChordSearch from "@/components/chords/ChordSearch";

// The search index comes from a cookie-free cached read (getChordIndex), so this
// layout carries no per-request/dynamic dependency and no longer forces the
// /chords/* subtree to render dynamically or hit Supabase on every visit.
export default async function ChordsLayout({ children }: { children: React.ReactNode }) {
	const index = await getChordIndex();

	return (
		<div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
			{children}
			{/* Bottom-anchored search: rests at the page bottom on short pages
			    (mt-auto) and floats pinned to the viewport once content scrolls
			    (sticky). The band is click-through; only the pill takes clicks. */}
			<div className="mt-auto sticky bottom-4 z-30 flex justify-center px-4 pt-4 pb-6 pointer-events-none">
				<div className="pointer-events-auto">
					<ChordSearch index={index} />
				</div>
			</div>
			<p className="py-3 text-center text-[10px] md:text-xs text-ink-dim border-t border-line">
				voicing data via{" "}
				<a
					href="https://github.com/tombatossals/chords-db"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-ink"
				>
					tombatossals/chords-db
				</a>
				{" · "}audio samples via{" "}
				<a
					href="https://github.com/surikov/webaudiofont"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-ink"
				>
					WebAudioFont
				</a>
			</p>
		</div>
	);
}
