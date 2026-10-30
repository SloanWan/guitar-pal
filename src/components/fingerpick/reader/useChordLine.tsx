import { useCallback, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import type { ChordLabel } from "@/lib/fingerpickToVexFlow";
import {
	chordFretHints,
	chordRegionEnd,
	chordToneNames,
	effectiveChords,
	heldButUnplucked,
	offShapeStrings,
	patternCapo,
	patternHasChords,
	type FretHint,
} from "@/lib/fingerpickChords";
import { chordTones } from "@/lib/chordFormulas";
import { voicingToDiagramShape } from "@/lib/chordVoicing";
import { pitchLabel, soundingMidi } from "@/lib/fingerpickPitch";
import { selectRefVoicing } from "@/lib/strumBars";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useChordVoicings } from "@/components/fingerpick/useChordVoicings";
import ChordShapeStrip, {
	CHORD_STRIP_ASPECT,
	CHORD_TONE_CHAR_EM,
	CHORD_TONE_GAP,
	chordToneFontSize,
} from "@/components/fingerpick/ChordShapeStrip";
import type { FingerpickPrefs } from "@/components/fingerpick/useFingerpickPrefs";

// A chord the formulas do not know is named from its voicing: at most the six
// strings' notes, eleven characters with spaces.
const UNKNOWN_TONES_LENGTH = 11;

/**
 * What the stave draws besides the frets: the shape over each chord symbol (with
 * its tones beside it, when asked), the fret numbers outside the shape in effect,
 * and the sounding pitch under each fret. Each is undefined while switched off,
 * which is how TabStaveRow knows to leave its room out.
 */
export function useChordLine(pattern: FingerpickPattern, prefs: FingerpickPrefs, user: User | null, loading: boolean) {
	const hasChords = patternHasChords(pattern.measures);
	const showDiagrams = hasChords && prefs.chordView === "diagram";
	const showTones = showDiagrams && prefs.chordTonesOn;
	const showOffShape = showDiagrams && prefs.offShapeOn;
	const width = prefs.chordShapeWidth;

	// The player's own shapes and the library's, for every chord the tab names.
	const { voicings: userVoicings } = useUserChordVoicings(showDiagrams ? user : null, loading || !showDiagrams);
	const chordRefs = useMemo(
		() => (showDiagrams ? pattern.measures.flatMap((m) => m.slots.flatMap((slot) => (slot.chord ? [slot.chord] : []))) : []),
		[pattern.measures, showDiagrams],
	);
	const voicingsFor = useChordVoicings(chordRefs, userVoicings);

	// What the chord line reserves per shape: the strip, and with the tones on the
	// widest tone line any chord writes beside it, so the lanes and the row's edge
	// are laid out for the whole overlay.
	const size = useMemo(() => {
		let reserved = width;
		if (showTones) {
			const widest = Math.max(
				0,
				...chordRefs.map((ref) => chordTones(ref.root, ref.suffix)?.map((t) => t.note).join(" ").length ?? UNKNOWN_TONES_LENGTH),
			);
			reserved += CHORD_TONE_GAP + Math.ceil(widest * chordToneFontSize(width) * CHORD_TONE_CHAR_EM);
		}
		return { width: reserved, height: Math.round(width * CHORD_STRIP_ASPECT) };
	}, [width, showTones, chordRefs]);

	// What each string plays in the shape under every slot. Recomputed when the tab or
	// a shape lookup changes, never per frame.
	const offShapeBySlot = useMemo<readonly number[][][]>(() => {
		if (!showOffShape) return [];
		const chords = effectiveChords(pattern.measures);
		return pattern.measures.map((measure, mi) =>
			measure.slots.map((slot, si) => {
				const ref = chords[mi][si];
				let hints: FretHint[] | null = null;
				if (ref) {
					const state = voicingsFor(ref);
					const voicing = state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
					hints = voicing ? chordFretHints(voicing) : null;
				}
				return offShapeStrings(slot, hints);
			}),
		);
	}, [pattern.measures, showOffShape, voicingsFor]);
	const offShapeAt = useCallback(
		(measureIndex: number, slotIndex: number): readonly number[] => offShapeBySlot[measureIndex]?.[slotIndex] ?? [],
		[offShapeBySlot],
	);

	// The pitch a written fret sounds with the capo on: the formula playback compiles through.
	const capo = patternCapo(pattern);
	const pitchStyle = prefs.pitchLabelStyle;
	const pitchLabelAt = useCallback(
		(stringIndex: number, fret: number, shift: number = 0): string => pitchLabel(soundingMidi(stringIndex, fret, capo) + shift, pitchStyle),
		[capo, pitchStyle],
	);

	// The shape over a chord symbol. Strings it holds that nothing in the chord's
	// stretch of the measure plucks are drawn faintly: the fingers that only complete
	// the chord read apart from the ones that sound.
	const chordDiagram = useCallback(
		(label: ChordLabel & { measureIndex: number }) => {
			const state = voicingsFor(label.chord);
			if (state.status !== "ready") return null;
			const voicing = selectRefVoicing(label.chord, state.voicings);
			const measure = pattern.measures[label.measureIndex];
			if (!voicing || !measure) return null;
			const unplucked = heldButUnplucked(measure.slots, label.slotIndex, chordRegionEnd(measure, label.slotIndex), voicing);
			const { frets, startFret, barreFret } = voicingToDiagramShape(voicing);
			const strip = (
				<ChordShapeStrip
					frets={frets}
					startFret={startFret}
					barreFret={barreFret}
					// The strip's strings are indexed low E first; the tab's the other way.
					dimmedStrings={[...unplucked].reverse()}
					width={width}
				/>
			);
			if (!showTones) return strip;
			return (
				<div className="flex items-center" style={{ gap: CHORD_TONE_GAP }}>
					{strip}
					<span className="tb-tones" style={{ fontSize: chordToneFontSize(width) }}>
						{chordToneNames(label.chord, voicing).join(" ")}
					</span>
				</div>
			);
		},
		[voicingsFor, pattern.measures, width, showTones],
	);

	return {
		hasChords,
		chordDiagram: showDiagrams ? chordDiagram : undefined,
		chordDiagramSize: size,
		offShapeAt: showOffShape ? offShapeAt : undefined,
		pitchLabel: prefs.pitchLabelsOn ? pitchLabelAt : undefined,
	};
}
