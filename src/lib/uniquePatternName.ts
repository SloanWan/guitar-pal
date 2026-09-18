/**
 * Pattern names are unique within a library, the way file names are in a
 * folder: saving "Waltz" next to an existing "Waltz" yields "Waltz (1)", then
 * "Waltz (2)". Comparison ignores case and surrounding whitespace. A name that
 * already carries a counter — "Waltz (1)" — counts up from its base, so a copy
 * of a copy is "Waltz (2)", not "Waltz (1) (1)".
 */
const COUNTER_SUFFIX = /^(.*?)\s\((\d+)\)$/;

function normalize(name: string): string {
	return name.trim().toLowerCase();
}

export function uniquePatternName(name: string, takenNames: readonly string[]): string {
	const trimmed = name.trim();
	const taken = new Set(takenNames.map(normalize));
	if (!taken.has(normalize(trimmed))) return trimmed;
	const base = trimmed.match(COUNTER_SUFFIX)?.[1] ?? trimmed;
	for (let n = 1; ; n++) {
		const candidate = `${base} (${n})`;
		if (!taken.has(normalize(candidate))) return candidate;
	}
}
