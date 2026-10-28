import { inversionName, toVoicingCards, type VoicingCard } from "@/lib/chordCards";
import { QUALITY_NAMES, chordSpec, withGlyphs } from "@/lib/chordFormulas";
import { MUTED } from "@/lib/chordShape";
import { isUnknownChord } from "@/lib/chordSuffixes";
import { formatTabSequence } from "@/lib/chordTabSequence";
import { isUserVoicingId, type UserChordVoicing } from "@/lib/userChordVoicings";

/** One shape on the chord page: the library's, or the player's own (`mine`). */
export interface PageShape extends VoicingCard {
	readonly mine: boolean;
	/** The shape as a tab writes it, first string first: open C is `01023x`. */
	readonly tab: string;
	/** What the shape is under the name: "C/E · omits 5"; empty when nothing to say. */
	readonly caption: string;
}

/**
 * Every shape the chord page offers, the library's first and the player's own
 * after them, so a chord always opens on the library's standard shape.
 */
export function pageShapes(
	library: readonly VoicingCard[],
	mine: readonly UserChordVoicing[],
	root: string,
	suffix: string,
): PageShape[] {
	const own = toVoicingCards(mine, root, suffix).map((card, i) => ({ ...card, label: mine[i].label ?? "Mine" }));
	return [...library, ...own].map((card) => ({
		...card,
		mine: isUserVoicingId(card.id),
		tab: formatTabSequence(card.def.frets.map((fret) => (fret < 0 ? MUTED : fret))),
		caption: shapeCaption(card, root, suffix),
	}));
}

export function shapeCaption(card: Pick<VoicingCard, "bass" | "omits">, root: string, suffix: string): string {
	const parts: string[] = [];
	const inversion = inversionName(card, root, suffix);
	if (inversion) parts.push(inversion);
	if (card.omits.length > 0) parts.push(`omits ${card.omits.join(", ")}`);
	return parts.join(" · ");
}

/** Keeps a shape index on the list — one that shrank (a shape deleted) or grew. */
export function clampShape(index: number, count: number): number {
	return count === 0 ? 0 : Math.min(Math.max(index, 0), count - 1);
}

/** The line under a chord's name: "Major seventh", "Major triad over E", "Your own chord". */
export function chordQualityLine(root: string, suffix: string): string {
	if (isUnknownChord(root, suffix)) return "Your own chord";
	const spec = chordSpec(suffix);
	const quality = spec ? QUALITY_NAMES[spec.baseSuffix] : undefined;
	if (!spec || !quality) return suffix;
	const line = spec.slashBass ? `${quality} over ${withGlyphs(spec.slashBass)}` : quality;
	return line.charAt(0).toUpperCase() + line.slice(1);
}
