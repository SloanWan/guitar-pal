import type { ChordIndexEntry } from "@/lib/chordSearch";
import { routeAssistantInput } from "@/lib/assistant/strum/router";
import { explainEditIntent, type EditIntentReading } from "@/lib/assistant/strum/editIntent";
import { readPhrase } from "@/lib/assistant/strum/readPhrase";
import { buildProposal } from "@/lib/assistant/strum/buildProposal";
import { suggestFrom } from "@/lib/assistant/strum/suggest";
import { smallTalk } from "@/lib/assistant/smallTalk";
import type { EditIntentExplanation } from "@/lib/assistant/strum/editIntent";
import type { AssistantProposal } from "@/lib/assistant/types";
import type { NamedPattern } from "@/lib/lastPattern";
import { PRESET_STRUM_PATTERNS, type ChordRef } from "@/lib/strumPatterns";
import { detectLang, pick, type Lang } from "@/lib/assistant/lang";
import { correctionsNote } from "@/lib/assistant/fuzzy";
import { correctStrumTypos } from "@/lib/assistant/strum/typos";
import { chordAskReply, readChordAsk } from "@/lib/assistant/chordAsk";

/**
 * One turn of the conversation, decided — by the app, never by a model.
 *
 * A sentence with a clear intent is a shortcut past the page's own controls,
 * and a shortcut has to be exact: it is read by rules, and when the rules fall
 * short the reply says what was read and offers sentences that would have
 * worked. A vague request is a different thing — a question, not an
 * instruction — and belongs to a model with the app's own material behind it,
 * which is a later piece of work. Until then nothing here reaches the network.
 */

export function deterministicReply(lang: Lang): string {
	return pick(lang, "Read straight from what you typed.", "照你打的读出来了。");
}
export function phraseReply(lang: Lang): string {
	return pick(
		lang,
		"Read from your words. The rhythm is a suggestion — change it if it isn't yours.",
		"从你的话里读出来了。节奏是我建议的——不合适就改。",
	);
}

export interface AssistantTurnOutcome {
	/** What the assistant says back. */
	text: string;
	/** Present when there is something concrete to preview. */
	proposal?: AssistantProposal;
	/** Present when the sentence asked how chords are played: the chords, for their shapes. */
	chords?: ChordRef[];
	/**
	 * Present when the sentence asked for a change to a pattern that already
	 * exists. Nothing has been written: the player confirms or corrects it first.
	 */
	edit?: EditIntentReading;
	/**
	 * Present when nothing read the sentence: sentences that would have, with
	 * blanks for what was missing, for the player to take into the composer.
	 */
	templates?: string[];
	/** Set when the turn failed; the panel renders it as an error, not as speech. */
	failed?: boolean;
	/** The language this turn was answered in — the player's, or the interface's. */
	lang: Lang;
	/**
	 * Present with `templates` when nothing read the sentence: what the readers
	 * saw in it, for the record that turns misses into eval cases.
	 */
	seen?: EditIntentExplanation;
}

export interface ResolveTurnInput {
	/** What the user just typed. */
	text: string;
	index: readonly ChordIndexEntry[];
	/** The player's own patterns, for a sentence that names one. */
	patterns?: readonly NamedPattern[];
	/** The interface's language, answered in when the message itself has none. */
	uiLang?: Lang;
}

/**
 * What the assistant says about an edit it has read.
 *
 * Written here rather than asked for: the app knows exactly what it understood,
 * so a sentence about it costs nothing, cannot drift from what will be saved,
 * and comes out in one language every time.
 */
export function editMessage(edit: EditIntentReading, lang: Lang = "en"): string {
	const q = (name: string) => (lang === "zh" ? `「${name}」` : `"${name}"`);
	switch (edit.kind) {
		case "attach": {
			if (edit.chordWords.length > 0) {
				const capo = edit.capo ? pick(lang, `, capo on ${edit.capo}`, `，变调夹 ${edit.capo} 品`) : "";
				return pick(
					lang,
					`Add these chords to ${q(edit.pattern.name)}${capo}? Nothing is saved until you say so.`,
					`把这些和弦加到${q(edit.pattern.name)}${capo}？你确认之前什么都不会保存。`,
				);
			}
			return pick(
				lang,
				`Read that as an edit to ${q(edit.pattern.name)}, but no chords came through — nothing in it reads as one. Want to write them yourself?`,
				`读成了对${q(edit.pattern.name)}的修改，但没读到和弦——句子里没有像和弦的词。要自己填吗？`,
			);
		}
		case "rename":
			if (isPreset(edit.pattern.id)) {
				return pick(
					lang,
					`${q(edit.pattern.name)} is one of the shipped patterns, and those keep their names. Your own patterns can be renamed.`,
					`${q(edit.pattern.name)}是内置 pattern，名字改不了。你自己建的可以改名。`,
				);
			}
			return edit.newName === ""
				? pick(lang, `Rename ${q(edit.pattern.name)} — to what?`, `把${q(edit.pattern.name)}改名——改成什么？`)
				: pick(
						lang,
						`Rename ${q(edit.pattern.name)} to ${q(edit.newName)}?`,
						`把${q(edit.pattern.name)}改名为${q(edit.newName)}？`,
					);
		case "delete":
			if (edit.aboutProgression) {
				return pick(
					lang,
					`I can delete a pattern of yours whole, not one progression on it. To remove a single progression from ${q(edit.pattern.name)}, use its progressions tab. Nothing was changed.`,
					`我只能整个删除你自建的 pattern，不能只删其中一条和弦进行。要删${q(edit.pattern.name)}里的某条进行，请去它的 progressions 标签页。什么都没改。`,
				);
			}
			if (isPreset(edit.pattern.id)) {
				return pick(
					lang,
					`${q(edit.pattern.name)} is one of the shipped patterns and cannot be deleted. Its progressions can be, from the progressions tab.`,
					`${q(edit.pattern.name)}是内置 pattern，删不了。它上面的和弦进行可以在 progressions 标签页删。`,
				);
			}
			return pick(
				lang,
				`Delete ${q(edit.pattern.name)}? This deletes the pattern itself — every progression written over it goes with it, and it cannot be undone. To remove only a progression, use the progressions tab instead.`,
				`删除${q(edit.pattern.name)}？这会删掉 pattern 本身——写在它上面的所有和弦进行一起没了，且无法撤销。只想删一条进行的话，请去 progressions 标签页。`,
			);
		case "ambiguous":
			return pick(
				lang,
				`${edit.matches.length} of your patterns are called ${q(edit.name)}. Which one did you mean?`,
				`你有 ${edit.matches.length} 个叫${q(edit.name)}的 pattern，指的是哪个？`,
			);
		case "unknown-pattern":
			if (edit.op !== "attach") {
				return pick(
					lang,
					`You have no pattern called ${q(edit.name)}. Check the name in the library.`,
					`你没有叫${q(edit.name)}的 pattern，去库里核对一下名字。`,
				);
			}
			return edit.chordWords.length > 0
				? pick(
						lang,
						`Read the chords as ${edit.chordWords.join(" ")}, but you have no pattern called ${q(edit.name)}. Make it, or pick the one you meant?`,
						`和弦读成了 ${edit.chordWords.join(" ")}，但你没有叫${q(edit.name)}的 pattern。新建一个，还是选一个已有的？`,
					)
				: pick(
						lang,
						`Read that as an edit, and got neither half: ${q(edit.name)} is not one of your patterns, and no chords came through. Want to fill it in yourself?`,
						`读成了一次修改，但两半都没读出来：${q(edit.name)}不是你的 pattern，也没读到和弦。要自己填吗？`,
					);
	}
}

/** The shipped patterns are base patterns: a progression can hang off one, nothing else changes. */
export function isPreset(patternId: string): boolean {
	return PRESET_STRUM_PATTERNS.some((p) => p.id === patternId);
}

export function resolveAssistantTurn({
	text: typed,
	index,
	patterns = [],
	uiLang = "en",
}: ResolveTurnInput): AssistantTurnOutcome {
	const lang = detectLang(typed, uiLang);

	// "hi" and "thanks" are not requests, and are answered before anything tries
	// to read them as one. Whole-message matches only.
	const talk = smallTalk(typed, lang);
	if (talk) return { text: talk.text, templates: talk.templates.length ? talk.templates : undefined, lang };

	// "How do I play F#m7?" is a question about a chord, not a chord line:
	// answered with its shapes, before any reader can take the F#m7 in it
	// for a one-chord progression.
	const ask = readChordAsk(typed, index);
	if (ask) return { text: chordAskReply(ask, lang), chords: ask.chords, lang };

	// Typos in the words the readers know are read past, and owned up to.
	const { text, corrections } = correctStrumTypos(typed, patterns);
	const note = correctionsNote(corrections, lang);

	// An edit names its target, so it is read before anything else: "add C G to
	// belief" is a chord line to every reader that comes after this one.
	const seen = explainEditIntent(text, patterns);
	if (seen.reading) return { text: note + editMessage(seen.reading, lang), edit: seen.reading, lang };

	const route = routeAssistantInput(text, index);
	if (route.path !== "llm") {
		const built = buildProposal({
			rhythm: route.path === "chords" ? null : route.rhythm,
			chordWords: route.chordWords,
			bpm: route.path === "phrase" ? route.bpm : null,
			name: route.path === "phrase" ? route.name : null,
			capo: route.path === "phrase" ? route.capo : null,
			// A style word names a feel, not the strokes; a rhythm written out is the strokes.
			rhythmGuessed: route.path === "phrase" && route.rhythmGuessed,
			index,
		});
		if (built.ok) {
			return {
				text:
					note +
					(route.path === "phrase" && route.rhythmGuessed ? phraseReply(lang) : deterministicReply(lang)),
				proposal: built.proposal,
				lang,
			};
		}
		// Notation that parses in the router but not here would be a bug, not a
		// user error; the guidance below at least hands back what was read.
	}

	// Nothing read it whole. Say what was read, and offer the sentences that
	// would have worked — never a model's guess at what was meant.
	const guidance = suggestFrom(seen, readPhrase(text, index), lang);
	return { text: note + guidance.text, templates: guidance.templates, seen, lang };
}
