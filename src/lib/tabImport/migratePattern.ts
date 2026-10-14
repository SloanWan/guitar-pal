import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { FINGERPICK_SCHEMA_VERSION } from "@/lib/fingerpickTypes";
import { syncTechniqueFields } from "@/lib/fingerpickCompat";

/**
 * A stored pattern of any schema version as the current one. Runs before the
 * validator on every read path — Supabase rows, localStorage, shares,
 * presets, every importer — so nothing downstream sees a v1 shape.
 *
 * v1 (no `schemaVersion`): the single `technique` field, `tied`,
 * `bendTarget` and the per-note flags are translated into `link`, `effects`
 * and `spans` (palm-mute / let-ring runs merge across barlines). Slide
 * direction is dropped — the frets say it. A column of `x` stays dead notes:
 * a slap cannot be told from them here.
 *
 * Tolerant and total: anything that is not shaped like a pattern is returned
 * as it came, for the validator to describe.
 */
export function migratePattern(raw: unknown): unknown {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
	const obj = raw as Record<string, unknown>;
	if (!Array.isArray(obj.measures)) return raw;
	if (obj.schemaVersion === FINGERPICK_SCHEMA_VERSION) return raw;
	if (!obj.measures.every(isMeasureLike)) return raw;
	return syncTechniqueFields(obj as unknown as FingerpickPattern);
}

function isMeasureLike(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false;
	const slots = (value as { slots?: unknown }).slots;
	return (
		Array.isArray(slots) &&
		slots.every(
			(slot) =>
				typeof slot === "object" &&
				slot !== null &&
				Array.isArray((slot as { strings?: unknown }).strings) &&
				(slot as { strings: unknown[] }).strings.length === 6 &&
				(slot as { strings: unknown[] }).strings.every((sf) => typeof sf === "object" && sf !== null),
		)
	);
}
