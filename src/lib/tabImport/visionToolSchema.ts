/**
 * Anthropic forced-tool-use schema for extracting a guitar tab image into a
 * structured draft (Issue #115).
 *
 * The schema is intentionally LOOSER than `FingerpickPattern`: the vision model
 * reports only the strings it actually sees (a sparse `notes` array), and the
 * `duration` enum is a deliberately narrow MVP subset. `draftFromToolOutput`
 * bridges this loose shape into a strict `FingerpickPattern`-shaped object that
 * `normalizeImportedPattern` (#114) can consume unchanged.
 *
 * This module is pure and DOM-free — no SDK usage, no network calls.
 */

// ─── Output type (mirrors input_schema below) ──────────────────────────────────

/** Notation style the model detected. Only `"standard"` is parsed this milestone. */
export type VisionNotation = "standard" | "chord-framed" | "unknown";

/** MVP duration subset — deliberately narrower than the full `Duration` union. */
export type VisionDuration =
	| "whole"
	| "half"
	| "quarter"
	| "eighth"
	| "sixteenth";

export type VisionTechnique =
	| "hammer-on"
	| "pull-off"
	| "slide-up"
	| "slide-down";

/** A single sounding string within a slot. `fret: "x"` = muted/dead note. */
export type VisionNote = {
	/** 0 = high e, 5 = low E (matches fingerpickTypes.ts indexing). */
	string: number;
	fret: number | "x";
	technique?: VisionTechnique;
	tied?: boolean;
	confidence?: "high" | "low";
	note?: string;
};

export type VisionSlot = {
	duration: VisionDuration;
	/** Sparse: only strings that sound in this slot. */
	notes: VisionNote[];
};

export type VisionMeasure = {
	slots: VisionSlot[];
};

/** Aligned exactly to `RepeatDirective` in types.ts. */
export type VisionRepeat = {
	range: [number, number];
	times: number;
};

export type VisionToolOutput = {
	notation: VisionNotation;
	timeSignature: [number, number];
	name?: string;
	bpm?: number;
	/** Expected empty when `notation !== "standard"`. */
	measures?: VisionMeasure[];
	repeats?: VisionRepeat[];
};

// ─── Anthropic tool definition ──────────────────────────────────────────────────

export type AnthropicToolDefinition = {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
};

export const EMIT_TAB_TOOL: AnthropicToolDefinition = {
	name: "emit_tab",
	description:
		"Emit the guitar tablature visible in the image as structured data. Report " +
		"only what you can actually see — leave optional fields out when the image " +
		"does not show them, and mark uncertain notes with confidence \"low\".",
	input_schema: {
		type: "object",
		properties: {
			notation: {
				type: "string",
				enum: ["standard", "chord-framed", "unknown"],
				description:
					"The notation style of the tab. \"standard\" = a 6-line tab staff with " +
					"fret numbers on string lines. \"chord-framed\" = chord names printed " +
					"above the staff with marks indicating which strings to strum under each " +
					"chord (NOT supported yet — set this and leave measures empty). " +
					"\"unknown\" = the image is not a readable guitar tab.",
			},
			timeSignature: {
				type: "array",
				description:
					"Time signature as [beatsPerMeasure, beatUnit], e.g. [4, 4] or [6, 8]. " +
					"Default to [4, 4] if none is printed.",
				items: { type: "integer" },
				minItems: 2,
				maxItems: 2,
			},
			name: {
				type: "string",
				description: "The song/pattern title, ONLY if one is clearly visible in the image.",
			},
			bpm: {
				type: "integer",
				minimum: 40,
				maximum: 300,
				description: "Tempo in BPM, ONLY if a tempo marking is visible.",
			},
			measures: {
				type: "array",
				description:
					"Ordered measures of the tab. Expected empty when notation is not " +
					"\"standard\". Each measure is a group of beat slots read left to right.",
				items: {
					type: "object",
					properties: {
						slots: {
							type: "array",
							description:
								"Beat slots in this measure, left to right. Each slot is one " +
								"rhythmic position that may sound zero or more strings together.",
							items: {
								type: "object",
								properties: {
									duration: {
										type: "string",
										enum: ["whole", "half", "quarter", "eighth", "sixteenth"],
										description:
											"Rhythmic value of this slot. Use the closest of these five " +
											"values only.",
									},
									notes: {
										type: "array",
										description:
											"SPARSE — list only the strings that actually sound in this " +
											"slot. Omit silent strings entirely; do not pad with rests.",
										items: {
											type: "object",
											properties: {
												string: {
													type: "integer",
													minimum: 0,
													maximum: 5,
													description:
														"String index: 0 = high e (thinnest, top tab line), " +
														"5 = low E (thickest, bottom tab line).",
												},
												fret: {
													description:
														"Fret number 0-24, or the literal \"x\" for a muted / " +
														"dead note.",
													oneOf: [
														{ type: "integer", minimum: 0, maximum: 24 },
														{ type: "string", enum: ["x"] },
													],
												},
												technique: {
													type: "string",
													enum: ["hammer-on", "pull-off", "slide-up", "slide-down"],
													description:
														"Articulation reaching this note FROM the previous note " +
														"on the same string. A hammer-on/pull-off connects two " +
														"DIFFERENT frets with a curved arc.",
												},
												tied: {
													type: "boolean",
													description:
														"True if this note is tied to — sustaining — the previous " +
														"note on the same string. A tie connects two IDENTICAL " +
														"frets with a curved arc; do NOT confuse it with a " +
														"hammer-on/pull-off, which connects DIFFERENT frets with a " +
														"visually similar arc. If the two connected frets are the " +
														"same number, it is a tie; if different, it is a " +
														"technique.",
												},
												confidence: {
													type: "string",
													enum: ["high", "low"],
													description:
														"Set to \"low\" when this note is smudged, ambiguous, or " +
														"you are guessing. Omit or \"high\" otherwise.",
												},
												note: {
													type: "string",
													description:
														"Short explanation of WHY confidence is low (only when " +
														"confidence is \"low\").",
												},
											},
											required: ["string", "fret"],
										},
									},
								},
								required: ["duration", "notes"],
							},
						},
					},
					required: ["slots"],
				},
			},
			repeats: {
				type: "array",
				description:
					"Repeat directives read from repeat bar-lines / \"x2\" markings. Each " +
					"gives an inclusive [start, end] range over measure indices and how many " +
					"total times that range is played.",
				items: {
					type: "object",
					properties: {
						range: {
							type: "array",
							description:
								"Inclusive [startMeasureIndex, endMeasureIndex] over the emitted " +
								"measures array.",
							items: { type: "integer" },
							minItems: 2,
							maxItems: 2,
						},
						times: {
							type: "integer",
							description: "Total number of times the range is played (e.g. 2 for \"x2\").",
						},
					},
					required: ["range", "times"],
				},
			},
		},
		required: ["notation", "timeSignature"],
	},
};
