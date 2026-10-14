import * as z from "zod";
import type { EffectKind, LinkKind, PercussionKind, SpanKind } from "@/lib/fingerpickTypes";

/**
 * The one list of techniques (model v2). Everything that used to be a
 * hand-kept list — the validator's known kinds, the render/audio support
 * table, the MCP and assistant tool schemas, the editor's menus and glyphs,
 * the ASCII reader/writer marks, the dev page's status badges — derives
 * from the entries here. Adding a technique is one entry plus, where it
 * applies, a renderer handler and a scheduler handler; a test ties the
 * `render` / `audio` flags to those handler tables.
 */

export type TechniqueCategory = "link" | "effect" | "span" | "slot";

/** The note a technique would go on, for the editor's availability rules. */
export interface NoteContext {
	fret: number | null;
	muted: boolean;
	/** The note on the same string in the previous slot; null when there is none. */
	prev: { fret: number | null; muted: boolean } | null;
	maxFret: number;
}

export type AvailabilityBlock =
	| "no-note"
	| "muted"
	| "open-string"
	| "off-neck"
	| "no-previous-note"
	| "previous-muted"
	| "wrong-direction"
	| "different-fret";

export interface AsciiMarks {
	/** Written before the fret (`h7`, `/7`). */
	before?: string;
	/** Written after the fret (`7~`); bends have their own writer. */
	after?: string;
	/** A line under the staff (`P.M.----`). */
	line?: string;
	/** A mark above the column (`S` for a slap). */
	above?: string;
}

export interface TechniqueDef {
	kind: string;
	category: TechniqueCategory;
	label: { en: string; zh: string };
	/** Editor cell glyph. */
	glyph: string;
	ascii?: AsciiMarks;
	/** The kind's parameters: the value under `effects[kind]`, or the whole object for links, spans and percussion. */
	params: z.ZodType;
	/** The converter draws it. */
	render: boolean;
	/** The scheduler voices it. */
	audio: boolean;
	available?: (ctx: NoteContext) => AvailabilityBlock | null;
	/** Editor shortcut, when it has one. */
	key?: string;
	/** Effects: the order modifiers stack over a note. */
	stackOrder?: number;
	/** Effects: extra stave width the mark needs beside the number. */
	extraWidth?: number;
}

// ─── Availability rules shared by several kinds ──────────────────────────────

const sounding = (ctx: NoteContext): AvailabilityBlock | null =>
	ctx.fret === null && !ctx.muted ? "no-note" : ctx.muted ? "muted" : null;

const fretted = (ctx: NoteContext): AvailabilityBlock | null => {
	const base = sounding(ctx);
	if (base) return base;
	return ctx.fret === 0 ? "open-string" : null;
};

const connected = (ctx: NoteContext): AvailabilityBlock | null => {
	const base = sounding(ctx);
	if (base) return base;
	if (!ctx.prev || ctx.prev.fret === null) return "no-previous-note";
	if (ctx.prev.muted) return "previous-muted";
	return null;
};

const ascending = (ctx: NoteContext): AvailabilityBlock | null => {
	const base = connected(ctx);
	if (base) return base;
	return (ctx.fret as number) > (ctx.prev!.fret as number) ? null : "wrong-direction";
};

const descending = (ctx: NoteContext): AvailabilityBlock | null => {
	const base = connected(ctx);
	if (base) return base;
	return (ctx.fret as number) < (ctx.prev!.fret as number) ? null : "wrong-direction";
};

const moving = (ctx: NoteContext): AvailabilityBlock | null => {
	const base = connected(ctx);
	if (base) return base;
	return ctx.fret !== ctx.prev!.fret ? null : "different-fret";
};

const sameFret = (ctx: NoteContext): AvailabilityBlock | null => {
	const base = connected(ctx);
	if (base) return base;
	return ctx.fret === ctx.prev!.fret ? null : "different-fret";
};

// ─── Parameter schemas ───────────────────────────────────────────────────────

/** Bend heights in quarter steps, up to 1½ tones. */
export const BEND_HEIGHTS_SEMITONES: readonly number[] = [0.5, 1, 1.5, 2, 2.5, 3];
export const BEND_SEMITONES = z
	.number()
	.refine((n) => BEND_HEIGHTS_SEMITONES.includes(n), { message: "bend height is 0.5, 1, 1.5, 2, 2.5 or 3 semitones" });

const FLAG = z.literal(true);

// ─── The registry ────────────────────────────────────────────────────────────

export const TECHNIQUES: readonly TechniqueDef[] = [
	// links — how the note is reached
	{
		kind: "tie",
		category: "link",
		label: { en: "Tied", zh: "延音线" },
		glyph: "⌒",
		ascii: { before: "(" },
		params: z.object({ kind: z.literal("tie") }),
		render: true,
		audio: true,
		available: sameFret,
	},
	{
		kind: "hammer",
		category: "link",
		label: { en: "Hammer-on", zh: "击弦" },
		glyph: "h",
		ascii: { before: "h" },
		params: z.object({ kind: z.literal("hammer") }),
		render: true,
		audio: true,
		available: ascending,
		key: "H",
	},
	{
		kind: "pull",
		category: "link",
		label: { en: "Pull-off", zh: "勾弦" },
		glyph: "p",
		ascii: { before: "p" },
		params: z.object({ kind: z.literal("pull") }),
		render: true,
		audio: true,
		available: descending,
		key: "P",
	},
	{
		kind: "slide",
		category: "link",
		label: { en: "Slide", zh: "滑音" },
		glyph: "/",
		ascii: { before: "/" },
		params: z.object({ kind: z.literal("slide"), picked: z.boolean().optional() }),
		render: true,
		audio: true,
		available: moving,
		key: "/",
	},
	// effects — what is done to the note
	{
		kind: "bend",
		category: "effect",
		label: { en: "Bend", zh: "推弦" },
		glyph: "⤴",
		params: z.object({
			semitones: BEND_SEMITONES,
			pre: z.boolean().optional(),
			release: z.boolean().optional(),
			hold: z.boolean().optional(),
		}),
		render: true,
		audio: true,
		available: fretted,
		key: "B",
		stackOrder: 10,
		extraWidth: 40,
	},
	{
		kind: "vibrato",
		category: "effect",
		label: { en: "Vibrato", zh: "揉弦" },
		glyph: "~",
		ascii: { after: "~" },
		params: z.object({ wide: z.boolean().optional(), bar: z.boolean().optional() }),
		render: true,
		audio: true,
		available: fretted,
		key: "V",
		stackOrder: 20,
		extraWidth: 20,
	},
	{
		kind: "harmonic",
		category: "effect",
		label: { en: "Harmonic", zh: "泛音" },
		glyph: "◇",
		params: z.object({
			type: z.enum(["natural", "artificial", "pinch"]),
			touchFret: z.number().int().min(0).max(24).optional(),
		}),
		render: true,
		audio: false,
		available: sounding,
		stackOrder: 30,
	},
	{
		kind: "tap",
		category: "effect",
		label: { en: "Tapping", zh: "点弦" },
		glyph: "T",
		ascii: { before: "t" },
		params: FLAG,
		render: true,
		audio: true,
		available: fretted,
		stackOrder: 40,
	},
	{
		kind: "trill",
		category: "effect",
		label: { en: "Trill", zh: "颤音" },
		glyph: "tr",
		ascii: { after: "tr" },
		params: z.object({ fret: z.number().int().min(0).max(24).optional() }),
		render: true,
		audio: true,
		available: sounding,
		stackOrder: 41,
	},
	{
		kind: "tremolo",
		category: "effect",
		label: { en: "Tremolo picking", zh: "震音拨弦" },
		glyph: "≡",
		params: z.object({ speed: z.enum(["8th", "16th", "32nd"]) }),
		render: true,
		audio: false,
		available: sounding,
		stackOrder: 50,
	},
	{
		kind: "pick",
		category: "effect",
		label: { en: "Pick stroke", zh: "拨片方向" },
		glyph: "⊓",
		params: z.object({ direction: z.enum(["down", "up"]) }),
		render: true,
		audio: false,
		available: sounding,
		stackOrder: 60,
	},
	{
		kind: "accent",
		category: "effect",
		label: { en: "Accent", zh: "重音" },
		glyph: ">",
		params: FLAG,
		render: true,
		audio: true,
		available: sounding,
		stackOrder: 70,
	},
	{
		kind: "staccato",
		category: "effect",
		label: { en: "Staccato", zh: "断音" },
		glyph: "·",
		params: FLAG,
		render: true,
		audio: true,
		available: sounding,
		stackOrder: 71,
	},
	{
		kind: "ghost",
		category: "effect",
		label: { en: "Ghost note", zh: "虚音" },
		glyph: "( )",
		params: FLAG,
		render: true,
		audio: true,
		available: sounding,
		stackOrder: 72,
	},
	{
		kind: "slideIn",
		category: "effect",
		label: { en: "Slide in", zh: "滑入" },
		glyph: "⟋",
		params: z.object({ from: z.enum(["below", "above"]) }),
		render: true,
		audio: false,
		available: fretted,
		stackOrder: 80,
	},
	{
		kind: "slideOut",
		category: "effect",
		label: { en: "Slide out", zh: "滑出" },
		glyph: "⟍",
		params: z.object({ to: z.enum(["below", "above"]) }),
		render: true,
		audio: false,
		available: fretted,
		stackOrder: 81,
	},
	{
		kind: "whammy",
		category: "effect",
		label: { en: "Whammy bar", zh: "摇把" },
		glyph: "w",
		params: z.object({ kind: z.enum(["dive", "pull"]), semitones: z.number().min(0).max(12).optional() }),
		render: false,
		audio: false,
		available: sounding,
		stackOrder: 90,
	},
	{
		kind: "scrape",
		category: "effect",
		label: { en: "Pick scrape", zh: "拨片刮弦" },
		glyph: "≋",
		params: FLAG,
		render: false,
		audio: false,
		available: sounding,
		stackOrder: 91,
	},
	// spans — marks over a run of notes
	{
		kind: "palmMute",
		category: "span",
		label: { en: "Palm mute", zh: "手掌闷音" },
		glyph: "P.M.",
		ascii: { line: "P.M." },
		params: z.object({ kind: z.literal("palmMute") }),
		render: true,
		audio: true,
		key: "M",
	},
	{
		kind: "letRing",
		category: "span",
		label: { en: "Let ring", zh: "延音" },
		glyph: "let ring",
		ascii: { line: "let ring" },
		params: z.object({ kind: z.literal("letRing") }),
		render: true,
		audio: true,
		key: "L",
	},
	{
		kind: "slur",
		category: "span",
		label: { en: "Slur", zh: "连音线" },
		glyph: "⌒⌒",
		ascii: { line: "slur" },
		params: z.object({ kind: z.literal("slur") }),
		render: false,
		audio: false,
	},
	// slot — a right-hand hit
	{
		kind: "slap",
		category: "slot",
		label: { en: "Slap", zh: "拍弦" },
		glyph: "S",
		ascii: { above: "S" },
		params: z.object({ kind: z.literal("slap"), accent: z.boolean().optional() }),
		render: true,
		audio: true,
		key: "S",
	},
	{
		kind: "thumbSlap",
		category: "slot",
		label: { en: "Thumb slap", zh: "拇指拍弦" },
		glyph: "T",
		ascii: { above: "T" },
		params: z.object({ kind: z.literal("thumbSlap"), accent: z.boolean().optional() }),
		render: true,
		audio: true,
	},
	{
		kind: "bodyTap",
		category: "slot",
		label: { en: "Body tap", zh: "打板" },
		glyph: "×",
		ascii: { above: "B" },
		params: z.object({ kind: z.literal("bodyTap"), accent: z.boolean().optional() }),
		render: true,
		audio: false,
	},
];

// ─── Derived views ───────────────────────────────────────────────────────────

const byKind = new Map(TECHNIQUES.map((t) => [t.kind, t]));

export function techniqueDef(kind: string): TechniqueDef | undefined {
	return byKind.get(kind);
}

export const LINK_DEFS = TECHNIQUES.filter((t) => t.category === "link");
export const EFFECT_DEFS = TECHNIQUES.filter((t) => t.category === "effect");
export const SPAN_DEFS = TECHNIQUES.filter((t) => t.category === "span");
export const PERCUSSION_DEFS = TECHNIQUES.filter((t) => t.category === "slot");

export const LINK_KINDS = LINK_DEFS.map((t) => t.kind) as LinkKind[];
export const EFFECT_KINDS = EFFECT_DEFS.map((t) => t.kind) as EffectKind[];
export const SPAN_KINDS = SPAN_DEFS.map((t) => t.kind) as SpanKind[];
export const PERCUSSION_KINDS = PERCUSSION_DEFS.map((t) => t.kind) as PercussionKind[];

export function isEffectKind(kind: string): kind is EffectKind {
	return byKind.get(kind)?.category === "effect";
}
export function isLinkKind(kind: string): kind is LinkKind {
	return byKind.get(kind)?.category === "link";
}
export function isSpanKind(kind: string): kind is SpanKind {
	return byKind.get(kind)?.category === "span";
}
export function isPercussionKind(kind: string): kind is PercussionKind {
	return byKind.get(kind)?.category === "slot";
}

/** What the app does with a kind today; the registry flags are the source of truth. */
export function supportOf(kind: string): { render: boolean; audio: boolean } {
	const def = byKind.get(kind);
	return def ? { render: def.render, audio: def.audio } : { render: false, audio: false };
}

/** The `link` object: one of the link kinds with its parameters. */
export const linkSchema: z.ZodType = z.union(LINK_DEFS.map((t) => t.params) as [z.ZodType, z.ZodType, ...z.ZodType[]]);

/** The `effects` map: every effect kind optional, value per its own schema. Unknown keys are the caller's to report. */
export const effectsSchema = z.object(
	Object.fromEntries(EFFECT_DEFS.map((t) => [t.kind, t.params.optional()])) as unknown as Record<EffectKind, z.ZodType>,
);

export const percussionSchema: z.ZodType = z.union(
	PERCUSSION_DEFS.map((t) => t.params) as [z.ZodType, z.ZodType, ...z.ZodType[]],
);

export const spanSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(SPAN_KINDS as [SpanKind, ...SpanKind[]]),
	from: z.string().min(1),
	to: z.string().min(1),
	strings: z.array(z.number().int().min(0).max(5)).min(1).max(6).optional(),
});

/** Effect kinds in the order their marks stack over a note. */
export const EFFECT_STACK_ORDER: readonly EffectKind[] = [...EFFECT_DEFS]
	.sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0))
	.map((t) => t.kind as EffectKind);
