import type Anthropic from "@anthropic-ai/sdk";

/**
 * The tools the General assistant can reach — the only way it produces a
 * pattern. Four of them hand the player's own sentence to a rules reader;
 * two let the model write a draft that the app validates before anything is
 * shown. The model never writes frets or cells into a card directly.
 *
 * Shared by the route (where the definitions go to the model) and the client
 * (which executes them and checks names). Pure and per-request-free, so the
 * definitions sit in the cached prefix.
 *
 * The sentence forms the reader tools take are written down in
 * docs/assistant-grammar.md; the descriptions below quote from it.
 */

export const TOOL_NAMES = [
	"read_strum",
	"read_tab",
	"edit_strum",
	"edit_tab",
	"propose_strum",
	"propose_tab",
	"show_chord",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(value: unknown): value is ToolName {
	return typeof value === "string" && (TOOL_NAMES as readonly string[]).includes(value);
}

/** Every reader tool takes the player's words, verbatim. */
export interface ReadInput {
	text: string;
}

/** What the model names when the player asks how chords are played. */
export interface ShowChordInput {
	/** Chord words in the order asked, each as the player wrote it: ["F#m7"], ["C", "Am", "F", "G"]. */
	chords: string[];
}

/** What the model writes when it composes a strumming pattern or progression itself. */
export interface ProposeStrumInput {
	name: string;
	/** Rhythm notation: one character per cell, `|` between bars. */
	rhythm: string;
	/** Chord words in order, one per bar; empty for a bare rhythm. */
	chords: string[];
	/** 0 when no tempo was asked for. */
	bpm: number;
}

/**
 * What the model writes when it composes a fingerpicking pattern itself.
 *
 * Notes on a grid, not ASCII tab: a column of ASCII is both a unit of time and
 * a character, so a two-digit fret costs two units and the rhythm ends up
 * inferred from the spacing (#268). Here every note names its slot.
 */
export interface ProposeTabInput {
	name: string;
	/** How many even slots each bar is divided into: 8 eighths, 16 sixteenths. */
	slotsPerBar: number;
	bars: { notes: { string: number; fret: number; slot: number; technique?: string; muted?: boolean }[] }[];
	/** 0 when no tempo was asked for. */
	bpm: number;
	/** e.g. "4/4", "3/4", "6/8"; empty for 4/4. */
	timeSignature: string;
}

const READ_SCHEMA: Anthropic.Tool.InputSchema = {
	type: "object",
	properties: {
		text: {
			type: "string",
			description: "The player's message, word for word. Do not rewrite, translate or trim it.",
		},
	},
	required: ["text"],
	additionalProperties: false,
};

export const TOOLS: readonly Anthropic.Tool[] = [
	{
		name: "read_strum",
		description:
			"Read the player's message as a strumming request: a chord line (\"C G Am F\"), a rhythm (\"D DU UD\"), or both, with an optional capo, tempo or name. Returns what the app read, or that it read nothing.",
		strict: true,
		input_schema: READ_SCHEMA,
	},
	{
		name: "read_tab",
		description:
			"Read the player's message as a fingerpicking request: a chord with a pick order (\"Am: 5 3 2 1\", \"C G: R_32^132\" — digits are strings, R the root, _ or ^ a held note), string and fret lists (\"string:654, fret:0-2-2\"), a named style over chords (\"travis picking in C\"), or a pasted six-line ASCII tab. Returns what the app read, or that it read nothing.",
		strict: true,
		input_schema: READ_SCHEMA,
	},
	{
		name: "edit_strum",
		description:
			"Read the player's message as a change to one of their strumming patterns by name: add chords to it, rename it, delete it. Returns the change the app read, waiting on the player to confirm, or that it read nothing.",
		strict: true,
		input_schema: READ_SCHEMA,
	},
	{
		name: "edit_tab",
		description:
			"Read the player's message as a change to one of their fingerpicking patterns by name: add or replace bars, mark chords on bars, rename, delete, set the tempo or meter. Returns the change the app read, waiting on the player to confirm, or that it read nothing.",
		strict: true,
		input_schema: READ_SCHEMA,
	},
	{
		name: "propose_strum",
		description:
			"Compose a strumming pattern or a chord progression yourself, when the player described what they want rather than writing it out. The app validates the rhythm and looks every chord up; it returns errors to fix if the notation is not playable.",
		strict: true,
		input_schema: {
			type: "object",
			properties: {
				name: { type: "string", description: "Two or three words." },
				rhythm: {
					type: "string",
					description:
						"Rhythm notation: D down, U up, X mute, space for a blank cell, | between bars. Cells divide each beat evenly, normally 8 or 16 per bar.",
				},
				chords: {
					type: "array",
					items: { type: "string" },
					description: "Chord words in order, one per bar, e.g. [\"C\",\"G\",\"Am\",\"F\"]. Empty for a bare rhythm.",
				},
				bpm: { type: "integer", description: "0 when the player gave no tempo." },
			},
			required: ["name", "rhythm", "chords", "bpm"],
			additionalProperties: false,
		},
	},
	{
		name: "propose_tab",
		description:
			"Compose a fingerpicking pattern or an exercise yourself, when the player described what they want rather than writing it out. Notes are placed on a grid of even slots, so the rhythm is exact and any fret can be written. The app validates it; it returns errors to fix if a note falls outside its bar.",
		strict: true,
		input_schema: {
			type: "object",
			properties: {
				name: { type: "string", description: "Two or three words." },
				slotsPerBar: {
					type: "integer",
					description:
						"How many even slots each bar is divided into. In 4/4: 8 for eighth notes, 16 for sixteenths. In 3/4 or 6/8: 6 for eighths, 12 for sixteenths. Every bar uses the same grid.",
				},
				bars: {
					type: "array",
					description: "The bars in order. A bar with no notes is a bar of rest. Write as many bars as the music needs.",
					items: {
						type: "object",
						properties: {
							notes: {
								type: "array",
								description: "The notes of this bar, in any order. A slot with no note on it is silent; a note sounds until the next slot that carries one.",
								items: {
									type: "object",
									properties: {
										string: { type: "integer", description: "1 = high e, 2 = B, 3 = G, 4 = D, 5 = A, 6 = low E." },
										fret: { type: "integer", description: "0 (open) to 24. Write the fret itself — 12 and 15 are ordinary." },
										slot: { type: "integer", description: "Which slot of this bar, counting from 0. The last is slotsPerBar - 1." },
										technique: {
											type: "string",
											description: "How the note is reached, when it is not picked: \"hammer-on\", \"pull-off\", \"slide-up\", \"slide-down\".",
										},
										muted: { type: "boolean", description: "A dead note — struck, not sounded." },
									},
									required: ["string", "fret", "slot"],
									additionalProperties: false,
								},
							},
						},
						required: ["notes"],
						additionalProperties: false,
					},
				},
				bpm: { type: "integer", description: "0 when the player gave no tempo." },
				timeSignature: { type: "string", description: "\"4/4\", \"3/4\" or \"6/8\". Empty for 4/4." },
			},
			required: ["name", "slotsPerBar", "bars", "bpm", "timeSignature"],
			additionalProperties: false,
		},
	},
	{
		name: "show_chord",
		description:
			"Show the player how chords are played: a diagram per chord with every shape the library holds for it, a link to each chord's page and, for several, to the grid that shows them side by side. For \"how do I play F#m7\", \"C和弦怎么按\", \"show me C Am F G\". The words as the player wrote them. Returns the chords it found, or the words the library has no chord for.",
		strict: true,
		input_schema: {
			type: "object",
			properties: {
				chords: {
					type: "array",
					items: { type: "string" },
					description: "Chord words in the order asked, each as the player wrote it: [\"F#m7\"], [\"C\", \"Am\", \"F\", \"G\"].",
				},
			},
			required: ["chords"],
			additionalProperties: false,
		},
	},
];
