import { CHORD_SUFFIX_CATEGORIES, ROOT_CHROMATIC_ORDER } from "@/lib/chordSuffixes";
import { rootToSlug } from "@/lib/chordSlug";

/** The chords hub's library: one root's chords, one quality in every key, the table, or the player's own. */
export type HubView = "root" | "quality" | "table" | "mine";

const VIEWS: readonly HubView[] = ["root", "quality", "table", "mine"];

/** Every quality the "By quality" view offers, in taxonomy order. */
export const HUB_QUALITIES: readonly string[] = CHORD_SUFFIX_CATEGORIES.flatMap((c) => c.suffixes);

export const DEFAULT_HUB_ROOT = "C";
export const DEFAULT_HUB_QUALITY = "m7";

export function parseHubView(value: string | undefined): HubView {
	return VIEWS.find((v) => v === value) ?? "root";
}

export function parseHubQuality(value: string | undefined): string {
	return value !== undefined && HUB_QUALITIES.includes(value) ? value : DEFAULT_HUB_QUALITY;
}

export function hubRootHref(root: string): string {
	return ROOT_CHROMATIC_ORDER.includes(root) ? `/chords/${rootToSlug(root)}` : "/chords";
}

export function hubQualityHref(suffix: string): string {
	return `/chords?view=quality&quality=${encodeURIComponent(suffix)}`;
}

export function hubViewHref(view: HubView, root: string, quality: string): string {
	if (view === "root") return hubRootHref(root);
	if (view === "quality") return hubQualityHref(quality);
	return `/chords?view=${view}`;
}

/** The anchor of a category's section in the "By root" view. */
export function hubCategoryId(category: string): string {
	return `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/** A quality as its chip says it: "maj", "m", "7", "m7b5". */
export function qualityLabel(suffix: string): string {
	return suffix === "major" ? "maj" : suffix === "minor" ? "m" : suffix;
}
