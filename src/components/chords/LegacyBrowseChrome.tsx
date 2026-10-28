import { getChordIndex } from "@/lib/chordsData";
import ChordSearch from "@/components/chords/ChordSearch";

/**
 * The bottom search pill and the data credits, for the chord pages still on the
 * old browse design. Goes away with them when the chords hub lands (#363 step 10).
 */
export default async function LegacyBrowseChrome({ children }: { children: React.ReactNode }) {
	const index = await getChordIndex();

	return (
		<div className="flex flex-col min-h-[calc(100vh_-_var(--gp-chrome-h))]">
			{children}
			{/* Rests at the page bottom on short pages and pins to the viewport once content
			    scrolls. The band is click-through; only the pill takes clicks. */}
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
					href="https://github.com/surikov/webaudiofontdata"
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
