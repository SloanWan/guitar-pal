import * as z from "zod";
import type { EffectKind, LinkKind, PercussionKind } from "@/lib/fingerpickTypes";
import { EFFECT_DEFS, LINK_DEFS, PERCUSSION_DEFS } from "@/lib/techniqueRegistry";

/**
 * The marks a note carries in the shapes a model writes — `import_tab`,
 * `propose_tab` on the MCP server and in the General assistant. One
 * definition, read off the technique registry, so a kind added there is
 * offered everywhere at once. Only the kinds the app draws or plays are
 * offered: the rest would come back as a warning anyway.
 */

const OFFERED_EFFECTS = EFFECT_DEFS.filter((t) => t.render || t.audio);

/** `kind — Label`, one per line, for a description the model reads. */
const listed = (defs: readonly { kind: string; label: { en: string } }[]) =>
	defs.map((t) => `${t.kind} (${t.label.en.toLowerCase()})`).join(", ");

export const LINK_INPUT = z
	.enum(LINK_DEFS.map((t) => t.kind) as [LinkKind, ...LinkKind[]])
	.describe(`How the note is reached from the previous note on its string, when it is not simply picked: ${listed(LINK_DEFS)}. A tie holds the previous note on instead of striking again.`);

/** The `effects` map as the model writes it: every offered kind optional, parameters per the registry. */
export const EFFECTS_INPUT = z
	.object(Object.fromEntries(OFFERED_EFFECTS.map((t) => [t.kind, t.params.optional()])) as Record<string, z.ZodType>)
	.describe(
		`What is done to the note once struck, keyed by kind, several at once if need be: ${listed(OFFERED_EFFECTS)}. bend takes {semitones: 0.5 (¼), 1 (½), 2 (full), up to 3; pre: true for a pre-bend; release: true to let it back down; hold: true to hold it into the next note}; vibrato takes {wide: true} for the wide kind; tremolo takes {speed: "8th" | "16th" | "32nd"}; pick takes {direction: "down" | "up"}; the flags (tap, accent, staccato, ghost) are written as true.`,
	);

export const OFFERED_EFFECT_KINDS = OFFERED_EFFECTS.map((t) => t.kind) as EffectKind[];

export const PERCUSSION_INPUT = z
	.enum(PERCUSSION_DEFS.map((t) => t.kind) as [PercussionKind, ...PercussionKind[]])
	.describe(`A right-hand hit on the slot instead of, or over, its notes: ${listed(PERCUSSION_DEFS)}.`);

/** The marks on one note, besides its string and fret. */
export const NOTE_MARKS_SHAPE = {
	link: LINK_INPUT.optional(),
	effects: EFFECTS_INPUT.optional(),
	muted: z.boolean().optional().describe("A dead note, printed as x: struck, not sounded."),
	palmMute: z.boolean().optional().describe("Under a P.M. bracket; mark every note the bracket spans."),
	letRing: z.boolean().optional().describe("Under a let-ring bracket; mark every note the bracket spans."),
};

export type NoteMarksInput = z.infer<z.ZodObject<typeof NOTE_MARKS_SHAPE>>;

/** A JSON schema for the Anthropic tool definition, without the `$schema` header. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
	const { $schema: _header, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
	void _header;
	return rest;
}
