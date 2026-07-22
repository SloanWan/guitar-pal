/**
 * Bridge layer between the loose `emit_tab` vision-tool output and the strict
 * `FingerpickPattern`-shaped object that `normalizeImportedPattern` (#114)
 * consumes. This module is pure and DOM-free.
 *
 * It expands each slot's SPARSE `notes` array into a strict 6-element `strings`
 * tuple, generates ids the vision model never supplies, resolves a couple of
 * downstream-invalid states (technique + tie on one note), and surfaces the
 * model's own low-confidence flags as `ValidationIssue` warnings whose `path`
 * matches `validateFingerpickPattern`'s convention exactly.
 */

import type { StringFret } from "@/lib/fingerpickTypes";
import type { RepeatDirective, ValidationIssue } from "./types";
import type { VisionNote, VisionToolOutput } from "./visionToolSchema";

export type DraftFromToolOutputResult = {
	/** Strict `FingerpickPattern`-shaped object, or null for unsupported notation. */
	raw: unknown | null;
	repeats: RepeatDirective[];
	modelWarnings: ValidationIssue[];
	unsupportedNotation: "chord-framed" | "unknown" | null;
};

function silentStringFret(): StringFret {
	return { fret: null, technique: null, tied: false, muted: false };
}

function makeDefaultStrings(): StringFret[] {
	return [
		silentStringFret(), silentStringFret(), silentStringFret(),
		silentStringFret(), silentStringFret(), silentStringFret(),
	];
}

/** Build a strict StringFret from one sparse vision note, recording any conflicts. */
function stringFretFromNote(
	note: VisionNote,
	path: string,
	modelWarnings: ValidationIssue[],
): StringFret {
	const muted = note.fret === "x";
	const fret = muted ? null : (note.fret as number);
	const technique = note.technique ?? null;
	let tied = note.tied === true;

	// technique and tied are mutually exclusive downstream — keep technique, drop tie.
	if (technique !== null && tied) {
		tied = false;
		modelWarnings.push({
			code: "MODEL_TECHNIQUE_TIED_CONFLICT",
			path,
			message: `Note reported both technique "${technique}" and tied:true (mutually exclusive); kept technique, dropped tie`,
			original: { technique, tied: true },
			repairedTo: { technique, tied: false },
		});
	}

	// Surface the model's own uncertainty as a warning the UI can render uniformly.
	if (note.confidence === "low") {
		modelWarnings.push({
			code: "MODEL_LOW_CONFIDENCE",
			path,
			message: note.note ?? "Model reported low confidence for this note",
			original: note.fret,
		});
	}

	return { fret, technique, tied, muted };
}

export function draftFromToolOutput(
	output: VisionToolOutput,
): DraftFromToolOutputResult {
	if (output.notation !== "standard") {
		return {
			raw: null,
			repeats: [],
			modelWarnings: [],
			unsupportedNotation: output.notation,
		};
	}

	const modelWarnings: ValidationIssue[] = [];

	const measures = (output.measures ?? []).map((measure, mi) => ({
		id: crypto.randomUUID(),
		slots: measure.slots.map((slot, si) => {
			const strings = makeDefaultStrings();
			for (const note of slot.notes) {
				const idx = note.string;
				if (!Number.isInteger(idx) || idx < 0 || idx > 5) continue;
				const path = `measures[${mi}].slots[${si}].strings[${idx}]`;
				strings[idx] = stringFretFromNote(note, path, modelWarnings);
			}
			return {
				id: crypto.randomUUID(),
				duration: slot.duration,
				strings,
			};
		}),
	}));

	const raw: Record<string, unknown> = {
		timeSignature: output.timeSignature,
		measures,
	};
	if (output.name !== undefined) raw.name = output.name;
	if (output.bpm !== undefined) raw.bpm = output.bpm;

	return {
		raw,
		repeats: output.repeats ?? [],
		modelWarnings,
		unsupportedNotation: null,
	};
}
