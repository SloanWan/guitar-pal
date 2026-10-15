import type { BeatSlot, EffectKind, FingerpickPattern, LinkKind, NoteEffects, PercussionKind, SpanKind, StringFret } from "@/lib/fingerpickTypes";
import { FINGERPICK_SCHEMA_VERSION } from "@/lib/fingerpickTypes";
import { spanIdFor } from "@/lib/fingerpickIndex";
import { TECHNIQUES, type TechniqueDef } from "@/lib/techniqueRegistry";

/**
 * One demo pattern per technique in the registry, for the gallery page: a
 * bar of quarters on the G string that shows the kind the way the editor
 * would write it. Built from the registry, so a kind added there appears
 * here without a line of page code — a test checks every kind has one.
 */

const G = 2;
const A = 4;

const silent = (): StringFret => ({ fret: null, muted: false });
const note = (fret: number, extra: Partial<StringFret> = {}): StringFret => ({ fret, muted: false, ...extra });

function slot(id: string, notes: Partial<Record<number, StringFret>>, extra: Partial<BeatSlot> = {}): BeatSlot {
	const strings = [silent(), silent(), silent(), silent(), silent(), silent()] as BeatSlot["strings"];
	for (const [i, sf] of Object.entries(notes)) if (sf) strings[Number(i)] = sf;
	return { id, duration: "quarter", strings, ...extra };
}

/** The parameters each effect is shown with — a complete, typical value of its kind. */
const DEMO_EFFECTS: { [K in EffectKind]: NonNullable<NoteEffects[K]> } = {
	bend: { semitones: 2, release: true },
	vibrato: { wide: true },
	harmonic: { type: "natural" },
	tap: true,
	trill: {},
	tremolo: { speed: "16th" },
	pick: { direction: "down" },
	accent: true,
	staccato: true,
	ghost: true,
	slideIn: { from: "below" },
	slideOut: { to: "below" },
	whammy: { kind: "dive" },
	scrape: true,
};

/** Frets that suit a kind: a harmonic and a tap sit high; the rest on the 7th. */
const DEMO_FRET: Partial<Record<EffectKind, number>> = { harmonic: 12, tap: 12 };

export interface TechniqueDemo {
	def: TechniqueDef;
	pattern: FingerpickPattern;
	/** What to listen or look for, in both languages. */
	note: { en: string; zh: string };
}

function base(id: string, slots: BeatSlot[], extra: Partial<FingerpickPattern> = {}): FingerpickPattern {
	return {
		id: `gallery-${id}`,
		name: id,
		bpm: 72,
		timeSignature: [4, 4],
		schemaVersion: FINGERPICK_SCHEMA_VERSION,
		measures: [{ id: `${id}-m1`, slots }],
		...extra,
	};
}

function linkDemo(kind: LinkKind): FingerpickPattern {
	const from = kind === "pull" ? 7 : 5;
	const to = kind === "tie" ? from : kind === "pull" ? 5 : 7;
	return base(kind, [
		slot(`${kind}-1`, { [G]: note(from) }),
		slot(`${kind}-2`, { [G]: note(to, { link: { kind } }) }),
		slot(`${kind}-3`, { [G]: note(from) }),
		slot(`${kind}-4`, { [G]: note(to, { link: { kind } }) }),
	]);
}

function effectDemo(kind: EffectKind): FingerpickPattern {
	const fret = DEMO_FRET[kind] ?? 7;
	const effects = { [kind]: DEMO_EFFECTS[kind] } as NoteEffects;
	return base(kind, [
		slot(`${kind}-1`, { [G]: note(fret) }),
		slot(`${kind}-2`, { [G]: note(fret, { effects }) }),
		slot(`${kind}-3`, { [G]: note(fret) }),
		slot(`${kind}-4`, { [G]: note(fret, { effects }) }),
	]);
}

function spanDemo(kind: SpanKind): FingerpickPattern {
	// A slur runs over the whole bar: a line of 2 4 5 4 hammered and pulled
	// under one arc, so the inner arcs' absence shows.
	if (kind === "slur") {
		return base(
			kind,
			[
				slot(`${kind}-1`, { [G]: note(2) }),
				slot(`${kind}-2`, { [G]: note(4, { link: { kind: "hammer" } }) }),
				slot(`${kind}-3`, { [G]: note(5, { link: { kind: "hammer" } }) }),
				slot(`${kind}-4`, { [G]: note(4, { link: { kind: "pull" } }) }),
			],
			{ spans: [{ id: spanIdFor(kind, `${kind}-1`), kind, from: `${kind}-1`, to: `${kind}-4` }] },
		);
	}
	return base(
		kind,
		[
			slot(`${kind}-1`, { [A]: note(0), [G]: note(2) }),
			slot(`${kind}-2`, { [A]: note(0), [G]: note(2) }),
			slot(`${kind}-3`, { [A]: note(0), [G]: note(2) }),
			slot(`${kind}-4`, { [A]: note(0), [G]: note(2) }),
		],
		{ spans: [{ id: spanIdFor(kind, `${kind}-2`), kind, from: `${kind}-2`, to: `${kind}-3` }] },
	);
}

function percussionDemo(kind: PercussionKind): FingerpickPattern {
	return base(kind, [
		slot(`${kind}-1`, { [A]: note(0), [G]: note(2) }),
		slot(`${kind}-2`, {}, { percussion: { kind } }),
		slot(`${kind}-3`, { [A]: note(0), [G]: note(2) }),
		slot(`${kind}-4`, {}, { percussion: { kind, accent: true } }),
	]);
}

const NOTES: Partial<Record<string, { en: string; zh: string }>> = {
	tie: { en: "Beats 2 and 4 are held on from the note before, not struck.", zh: "第 2、4 拍延续前一个音，不再拨弦。" },
	hammer: { en: "5 to 7: the second note is quieter and softer, with no pick attack.", zh: "5 到 7：第二个音更轻、更柔，没有拨弦起音。" },
	pull: { en: "7 to 5, the legato pair the other way.", zh: "7 到 5，反方向的连奏。" },
	slide: { en: "The sounding note glides from 5 up to 7 — one attack, moving pitch.", zh: "正在响的音从 5 品滑到 7 品：一次起音，音高在动。" },
	bend: { en: "A full-tone bend that comes back down; the arrow shows the height.", zh: "推高一个全音再放回；箭头标出高度。" },
	vibrato: { en: "Wide vibrato: the pitch wobbles above the fretted note.", zh: "大幅揉弦：音高在按品音之上来回。" },
	harmonic: { en: "<12> N.H.: the open G an octave up, as a harmonic sounds, with a quiet octave under it.", zh: "<12> 自然泛音：空弦 G 高八度（泛音的真实音高），下面垫一个很轻的低八度。" },
	tap: { en: "T: a tapped note — the sample starts past its pick transient, eases in, and is lighter.", zh: "T：点弦——跳过采样的拨片瞬态、渐入，并且更轻。" },
	trill: { en: "tr~~~: the note alternates with the fret above ten times a second, hammered and pulled.", zh: "tr~~~：与上一品每秒交替十次，击弦上去、勾弦回来。" },
	tremolo: { en: "Tremolo at 16ths: the note is struck four times a beat, every second stroke a touch softer.", zh: "十六分震音：一拍内击弦四次，隔次稍轻。" },
	pick: { en: "A pick-direction mark; no change to the sound.", zh: "拨片方向记号；声音不变。" },
	accent: { en: ">: louder.", zh: ">：更响。" },
	staccato: { en: "·: the note lasts a fifth of its slot.", zh: "·：音只响时值的五分之一。" },
	ghost: { en: "(7): drawn in parentheses, played at the ghost gain.", zh: "(7)：括号记号，用虚音音量。" },
	slideIn: { en: "A slide into the note from two frets below: the pitch glides up to it as it is struck.", zh: "从下方两品滑入：起音时音高滑上来。" },
	slideOut: { en: "A slide out of the note downwards: the pitch leaves and the note fades with it.", zh: "向下滑出：音高离开，音随之淡出。" },
	whammy: { en: "w/bar dive: the bar takes the note down a whole tone over three quarters of its length and holds it there.", zh: "摇把下潜：在音长的四分之三内降一个全音并停住。" },
	scrape: { en: "P.S.: a pick scrape — noise swept down the strings, no pitch.", zh: "P.S.：拨片刮弦——沿弦向下扫的噪声，没有音高。" },
	palmMute: { en: "Beats 2 and 3 under P.M.: damped, dull and short.", zh: "第 2、3 拍在 P.M. 下：闷、暗、短。" },
	letRing: { en: "Beats 2 and 3 ring on into the next note.", zh: "第 2、3 拍延音到下一个音。" },
	slur: { en: "One slur over all four notes: 2 4 5 4 hammered and pulled under one arc, the inner arcs left out, the inner notes legato.", zh: "一条连音线覆盖四个音：2 4 5 4 的击弦、勾弦在一条弧下，内部不再画弧，内部的音连奏。" },
	slap: { en: "Beats 2 and 4 are a slap across the strings, the second accented.", zh: "第 2、4 拍拍弦，第二次带重音。" },
	thumbSlap: { en: "A thumb slap strikes the bass strings dead.", zh: "拇指拍弦闷击低音弦。" },
	bodyTap: { en: "A knock on the body: a low thump, drawn as B.", zh: "打板：低沉的一记闷响，画作 B。" },
};

function demoFor(def: TechniqueDef): FingerpickPattern {
	switch (def.category) {
		case "link":
			return linkDemo(def.kind as LinkKind);
		case "effect":
			return effectDemo(def.kind as EffectKind);
		case "span":
			return spanDemo(def.kind as SpanKind);
		case "slot":
			return percussionDemo(def.kind as PercussionKind);
	}
}

export const TECHNIQUE_DEMOS: readonly TechniqueDemo[] = TECHNIQUES.map((def) => ({
	def,
	pattern: demoFor(def),
	note: NOTES[def.kind] ?? { en: "", zh: "" },
}));
