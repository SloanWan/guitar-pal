import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

/**
 * A chord shape as the player edits it, and its translation to the stored
 * `ChordVoicing` form.
 *
 * The two differ deliberately. On the wire a fret is written relative to the
 * diagram window (`start_fret - 1 + rel`), which is what the renderer wants but
 * makes every edit a sum: moving the window would silently move every note.
 * Here a fret is the fret on the neck, so an open string is 0 whatever the
 * window is, and the window is only a constraint on how far apart the notes may
 * sit. Encoding does the arithmetic once, in one place, with tests either side
 * of it — a wrong conversion here is a silent wrong pitch, not a crash.
 *
 * String order matches `GUITAR_OPEN_MIDI` throughout: index 0 is string 6, the
 * low E, and index 5 is string 1, the high e.
 */

/** Frets the diagram shows at once. A shape's notes must fit inside this span. */
export const CHORD_SHAPE_WINDOW = 5;

/**
 * Highest fret a window may start on. The window reaches four frets further, so
 * this covers the whole neck of an ordinary guitar without allowing a start fret
 * that no instrument has.
 */
export const MAX_SHAPE_START_FRET = 18;

/** Fingers a player has. 0 means "no finger written", which is allowed. */
export const MAX_FINGER = 4;

/** A muted string. Anything else is a fret number, 0 being the open string. */
export const MUTED = "x" as const;

export type ShapeFret = number | typeof MUTED;

export interface ChordShape {
	/** First fret of the window. 1 puts the window against the nut. */
	startFret: number;
	/** Six entries, low E first. A number is the fret on the neck; 0 is open. */
	frets: ShapeFret[];
	/** Six entries, low E first. 0 means no finger written. */
	fingers: number[];
	/** The fret barred, on the neck, or null. */
	barreFret: number | null;
}

export function emptyChordShape(startFret = 1): ChordShape {
	return {
		startFret,
		frets: Array.from({ length: 6 }, () => MUTED as ShapeFret),
		fingers: Array.from({ length: 6 }, () => 0),
		barreFret: null,
	};
}

export interface ShapeValidation {
	ok: boolean;
	errors: string[];
}

/** Whether a fret sits inside the window a shape declares. 0 (open) always does. */
export function fretInWindow(fret: ShapeFret, startFret: number): boolean {
	if (fret === MUTED || fret === 0) return true;
	return fret >= startFret && fret <= startFret + CHORD_SHAPE_WINDOW - 1;
}

/** Strings held down at a given fret, low E first. */
export function stringsAtFret(shape: ChordShape, fret: number): number[] {
	return shape.frets
		.map((f, i) => (f === fret ? i : -1))
		.filter((i) => i !== -1);
}

/**
 * Reject a shape that cannot be drawn or played.
 *
 * Reported as a list rather than thrown: the editor wants every problem at once,
 * the same way `validateBars` treats a bar.
 */
export function validateChordShape(shape: ChordShape): ShapeValidation {
	const errors: string[] = [];

	if (!Number.isInteger(shape.startFret) || shape.startFret < 1) {
		errors.push("start fret must be a whole fret at or above the first");
	} else if (shape.startFret > MAX_SHAPE_START_FRET) {
		errors.push(`start fret must be ${MAX_SHAPE_START_FRET} or lower`);
	}

	if (shape.frets.length !== 6) errors.push("a shape has six strings");
	if (shape.fingers.length !== 6) errors.push("a shape has six finger positions");

	shape.frets.forEach((fret, i) => {
		if (fret === MUTED) return;
		if (!Number.isInteger(fret) || fret < 0) {
			errors.push(`string ${6 - i}: fret must be a whole fret, 0, or muted`);
			return;
		}
		if (!fretInWindow(fret, shape.startFret)) {
			// A span, not a position: a shape at the ninth fret is as expressible as
			// one at the first, so long as its notes lie within one window.
			errors.push(
				`string ${6 - i}: fret ${fret} is outside the ${CHORD_SHAPE_WINDOW}-fret window starting at ${shape.startFret}`,
			);
		}
	});

	shape.fingers.forEach((finger, i) => {
		if (!Number.isInteger(finger) || finger < 0 || finger > MAX_FINGER) {
			errors.push(`string ${6 - i}: finger must be 0 to ${MAX_FINGER}`);
		}
	});

	if (shape.frets.every((fret) => fret === MUTED)) {
		errors.push("a shape must sound at least one string");
	}

	if (shape.barreFret !== null) {
		if (!fretInWindow(shape.barreFret, shape.startFret) || shape.barreFret === 0) {
			errors.push("the barre must sit on a fret inside the window");
		} else if (stringsAtFret(shape, shape.barreFret).length < 2) {
			// One string held at a fret is a finger, not a barre; drawing it as one
			// would tell the player to do something they are not doing.
			errors.push("a barre needs at least two strings held at that fret");
		}
	}

	return { ok: errors.length === 0, errors };
}

/**
 * A fingering for a shape, to fill the editor in before the player adjusts it.
 *
 * One rule does most of the work: **the finger number rises with the fret**.
 * Fingers do not cross on a guitar neck, so sorting the held notes by fret and
 * handing out 1, 2, 3, 4 in that order reproduces the standard fingering of the
 * open chords almost everywhere.
 *
 * The judgement is when to barre. "The lowest fret has two strings on it" is the
 * obvious rule and it is wrong: D (xx0232) has two notes at the second fret with
 * a higher note between them, and is fingered 1-3-2, not barred, because three
 * notes need three fingers and no more. What forces a barre is running out of
 * fingers — so the condition is more held notes than fingers, with at least two
 * of them sharing the lowest fret. That barres F (133211, six notes) and Bm
 * (x24432, five) while leaving D, A, C and Am alone.
 *
 * A barre the player set themselves is honoured rather than re-inferred: they
 * are telling the editor what their hand is doing.
 */
export function suggestFingers(shape: ChordShape): number[] {
	const held = shape.frets
		.map((fret, stringIdx) => ({ stringIdx, fret }))
		.filter((n): n is { stringIdx: number; fret: number } =>
			typeof n.fret === "number" && n.fret > 0,
		);
	if (held.length === 0) return Array.from({ length: 6 }, () => 0);

	const lowestFret = Math.min(...held.map((n) => n.fret));
	const atLowest = held.filter((n) => n.fret === lowestFret);
	const inferredBarre =
		held.length > MAX_FINGER && atLowest.length >= 2 ? lowestFret : null;
	const barreFret = shape.barreFret ?? inferredBarre;

	const fingers = Array.from({ length: 6 }, () => 0);
	let next = 1;

	if (barreFret !== null && held.some((n) => n.fret === barreFret)) {
		for (const note of held) {
			if (note.fret === barreFret) fingers[note.stringIdx] = 1;
		}
		next = 2;
	}

	const remaining = held
		.filter((n) => n.fret !== barreFret)
		.sort((a, b) => a.fret - b.fret || a.stringIdx - b.stringIdx);

	for (const note of remaining) {
		fingers[note.stringIdx] = Math.min(next, MAX_FINGER);
		next += 1;
	}

	return fingers;
}

/**
 * Encode for storage. Frets become window-relative, which is the form
 * `decodeVoicingStrings` expects and the only place that arithmetic happens.
 *
 * `capo` is false: the barre is drawn across exactly the strings held at that
 * fret, not across all six. A user's shape describes what their hand does.
 */
export function chordShapeToVoicing(
	shape: ChordShape,
	id: string,
	label: string | null = null,
): ChordVoicing {
	const frets = shape.frets
		.map((fret) => {
			if (fret === MUTED) return MUTED;
			if (fret === 0) return "0";
			return String(fret - shape.startFret + 1);
		})
		.join("");

	return {
		id,
		label,
		start_fret: shape.startFret,
		barre_fret: shape.barreFret === null ? null : shape.barreFret - shape.startFret + 1,
		capo: false,
		frets,
		fingers: shape.fingers.join(""),
	};
}

/** Decode a stored voicing back into an editable shape. Inverse of the above. */
export function voicingToChordShape(voicing: ChordVoicing): ChordShape {
	const startFret = voicing.start_fret;
	const frets: ShapeFret[] = Array.from({ length: 6 }, (_, i) => {
		const char = voicing.frets[i];
		if (char === MUTED) return MUTED;
		const rel = Number.parseInt(char, 10);
		if (!Number.isFinite(rel)) return MUTED;
		return rel === 0 ? 0 : startFret - 1 + rel;
	});
	const fingers = Array.from({ length: 6 }, (_, i) => {
		const finger = Number.parseInt(voicing.fingers[i], 10);
		return Number.isFinite(finger) && finger >= 0 && finger <= MAX_FINGER ? finger : 0;
	});

	return {
		startFret,
		frets,
		fingers,
		barreFret: voicing.barre_fret === null ? null : startFret - 1 + voicing.barre_fret,
	};
}
