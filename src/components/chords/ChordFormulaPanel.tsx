import { chordSpec, chordTones, QUALITY_NAMES, withGlyphs } from "@/lib/chordFormulas";
import { getSuffixCategory } from "@/lib/chordSuffixes";

interface Props {
	root: string;
	suffix: string;
}

// What the chord is, above the shapes that play it (#234): its quality, and
// every tone it may sound with the degree under each. A server component with
// no state — the page hands it a root and suffix and it renders or it doesn't.
// Note names arrive spelled with real ♭/♯ glyphs, so nothing here goes through
// MusicalText.
export default function ChordFormulaPanel({ root, suffix }: Props) {
	const spec = chordSpec(suffix);
	const tones = chordTones(root, suffix);
	if (!spec || !tones) return null;

	const category = getSuffixCategory(spec.baseSuffix);
	const quality = QUALITY_NAMES[spec.baseSuffix];

	return (
		<section aria-label="Chord tones" className="flex flex-col items-center gap-3">
			{(category || quality) && (
				<p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
					{[category, quality].filter(Boolean).join(" · ")}
				</p>
			)}
			<ol className="flex flex-wrap justify-center gap-2">
				{tones.map((tone) => (
					<li
						key={tone.semitones}
						className="flex min-w-12 flex-col items-center border border-line bg-denim-tint px-2 py-1.5"
					>
						<span className="text-base font-medium text-ink">{tone.note}</span>
						<span className="font-mono text-[10px] text-ink-dim">{tone.degree}</span>
					</li>
				))}
			</ol>
			{spec.slashBass && (
				<p className="text-xs text-ink-dim">over {withGlyphs(spec.slashBass)} in the bass</p>
			)}
		</section>
	);
}
