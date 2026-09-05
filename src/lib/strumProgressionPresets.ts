/**
 * The progressions a player reaches for again and again, offered under the
 * composer so a sequence can be started from a known shape instead of an empty
 * line. Each one is written exactly as it would be typed — `parseChordSequence`
 * resolves them through the same ranked search as anything hand-entered, so a
 * preset carries no chord ids and cannot drift from the library.
 *
 * Keys are chosen for the guitar, not for theory: open-position C, G, Am, Em
 * and A, so every preset is playable before any capo.
 */

export type PresetGroup = "Pop" | "J-Pop" | "Blues & Rock" | "Jazz & Minor";

export interface ProgressionPreset {
	id: string;
	name: string;
	/** The shape in scale degrees — what makes two presets in different keys the same idea. */
	degrees: string;
	/** The chord line, in the notation the composer parses. */
	chords: string;
	group: PresetGroup;
}

export const PROGRESSION_PRESETS: readonly ProgressionPreset[] = [
	{
		id: "four-chords",
		name: "Four Chords",
		degrees: "I–V–vi–IV",
		chords: "C G Am F",
		group: "Pop",
	},
	{
		id: "sensitive-female",
		name: "Sensitive Female",
		degrees: "vi–IV–I–V",
		chords: "Am F C G",
		group: "Pop",
	},
	{
		id: "doo-wop",
		name: "Doo-Wop",
		degrees: "I–vi–IV–V",
		chords: "C Am F G",
		group: "Pop",
	},
	{
		id: "royal-road",
		name: "Royal Road (4536)",
		degrees: "IV–V–iii–vi",
		chords: "F G Em Am",
		group: "J-Pop",
	},
	{
		id: "komuro",
		name: "Komuro",
		degrees: "vi–IV–V–I",
		chords: "Am F G C",
		group: "J-Pop",
	},
	{
		id: "canon",
		name: "Canon",
		degrees: "I–V–vi–iii–IV–I–IV–V",
		chords: "C G Am Em F C F G",
		group: "J-Pop",
	},
	{
		id: "three-chords",
		name: "Three Chords",
		degrees: "I–IV–V",
		chords: "G C D",
		group: "Blues & Rock",
	},
	{
		id: "twelve-bar-blues",
		name: "12-Bar Blues",
		degrees: "I–IV–V · 12 bars",
		// Ends on the V turnaround, the shape that loops back into bar one.
		chords: "A A A A D D A A E D A E",
		group: "Blues & Rock",
	},
	{
		id: "andalusian",
		name: "Andalusian",
		degrees: "i–VII–VI–V",
		chords: "Am G F E",
		group: "Blues & Rock",
	},
	{
		id: "two-five-one",
		name: "ii–V–I",
		degrees: "ii7–V7–Imaj7",
		chords: "Dm7 G7 Cmaj7",
		group: "Jazz & Minor",
	},
	{
		id: "turnaround",
		name: "Turnaround",
		degrees: "I–vi–ii–V",
		chords: "C Am Dm G",
		group: "Jazz & Minor",
	},
	{
		id: "minor-loop",
		name: "Minor Loop",
		degrees: "i–VI–III–VII",
		chords: "Em C G D",
		group: "Jazz & Minor",
	},
];

/** Splits a chord line the way the composer's parser does. */
function tokenize(line: string): string[] {
	return line
		.toLowerCase()
		.split(/[\s,|]+/)
		.filter((token) => token !== "" && !/^[-–—]+$/.test(token));
}

/**
 * Whether `presetChords` contains the typed chords as a run: `C G` matches
 * `C G Am F`, and a half-typed last chord still counts, so `C G A` keeps
 * `C G Am F` on the list rather than emptying it under the user's fingers.
 */
function containsChordRun(presetChords: string, typed: string[]): boolean {
	const chords = tokenize(presetChords);
	if (typed.length > chords.length) return false;
	for (let start = 0; start + typed.length <= chords.length; start++) {
		if (typed.every((token, i) => chords[start + i].startsWith(token))) return true;
	}
	return false;
}

/**
 * The presets still worth offering for what has been typed. A query matches on
 * the chords themselves (as a run, above) or on the name and degrees, so both
 * "am f" and "blues" narrow the list. An empty query keeps everything.
 */
export function filterPresets(
	presets: readonly ProgressionPreset[],
	query: string,
): ProgressionPreset[] {
	const trimmed = query.trim().toLowerCase();
	if (trimmed === "") return [...presets];
	const typed = tokenize(query);
	return presets.filter(
		(preset) =>
			preset.name.toLowerCase().includes(trimmed) ||
			preset.degrees.toLowerCase().includes(trimmed) ||
			preset.group.toLowerCase().includes(trimmed) ||
			(typed.length > 0 && containsChordRun(preset.chords, typed)),
	);
}

/** The presets in display order, grouped under their headings. */
export function groupPresets(
	presets: readonly ProgressionPreset[],
): { group: PresetGroup; presets: ProgressionPreset[] }[] {
	const groups: { group: PresetGroup; presets: ProgressionPreset[] }[] = [];
	for (const preset of presets) {
		const last = groups.at(-1);
		if (last && last.group === preset.group) last.presets.push(preset);
		else groups.push({ group: preset.group, presets: [preset] });
	}
	return groups;
}
