import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { ChordRef } from "@/lib/strumPatterns";
import { normalizeImportedPattern } from "@/lib/tabImport";
import { explainEditIntent, type EditIntentExplanation } from "@/lib/strumAssistant/editIntent";
import { detectLang, pick, type Lang } from "@/lib/strumAssistant/lang";
import { smallTalk } from "@/lib/strumAssistant/smallTalk";
import { buildTabProposal } from "@/lib/tabAssistant/buildTabProposal";
import { readTabSentence } from "@/lib/tabAssistant/readTabSentence";
import { routeTabInput } from "@/lib/tabAssistant/router";
import { suggestTab } from "@/lib/tabAssistant/suggest";
import type { TabProposal } from "@/lib/tabAssistant/types";
import { loadVoicingLookup, type VoicingLookup } from "@/lib/tabAssistant/voicings";

/**
 * One turn of the conversation on the fingerpick page, decided by the app.
 *
 * The tab counterpart of `resolveAssistantTurn`, on the same terms: a
 * sentence with a clear intent is read by rules, the reply is written here in
 * the player's language, and when the rules fall short the reply says what
 * was read and offers sentences that would have worked. Nothing reaches a
 * model. The one thing this turn waits on is the chord library, for the
 * shapes the frets come from.
 */

export interface TabTurnOutcome {
	text: string;
	proposal?: TabProposal;
	templates?: string[];
	lang: Lang;
	/** With `templates`: what the readers saw, for the record that turns misses into eval cases. */
	seen?: EditIntentExplanation;
}

export interface ResolveTabTurnInput {
	text: string;
	index: readonly ChordIndexEntry[];
	uiLang?: Lang;
	/** How the shapes are fetched; the default reads the chord library. Injected so a turn can be tested without one. */
	voicings?: (refs: readonly ChordRef[]) => Promise<VoicingLookup>;
}

export function tabReply(kind: "notes" | "order" | "style" | "chords" | "ascii", lang: Lang): string {
	switch (kind) {
		case "notes":
			return pick(lang, "Read the strings and frets as you wrote them.", "按你写的弦号和品格读出来了。");
		case "order":
			return pick(lang, "Read straight from what you typed — the frets are the chord's.", "照你打的读出来了——品格取自和弦指法。");
		case "style":
			return pick(
				lang,
				"Laid the shipped pattern's picking over your chord. Open it to check the frets and the feel.",
				"把内置 pattern 的指法铺到了你的和弦上。打开看看品格和感觉对不对。",
			);
		case "chords":
			return pick(
				lang,
				"Read the chords. The picking order is a suggestion — change it if it isn't yours.",
				"和弦读出来了。分解顺序是我建议的——不合适就改。",
			);
		case "ascii":
			return pick(
				lang,
				"Read the tab. The rhythm came from the spacing, so check it in the editor before saving.",
				"tab 读出来了。节奏是按字距推的，保存前在编辑器里核对一下。",
			);
	}
}

export async function resolveTabTurn({
	text,
	index,
	uiLang = "en",
	voicings = loadVoicingLookup,
}: ResolveTabTurnInput): Promise<TabTurnOutcome> {
	const lang = detectLang(text, uiLang);

	const talk = smallTalk(text, lang);
	if (talk) return { text: talk.text, templates: talk.templates.length ? talk.templates : undefined, lang };

	const route = routeTabInput(text, index);

	if (route.path === "ascii") {
		const { pattern, errors, warnings } = normalizeImportedPattern(route.draft);
		if (pattern) {
			// The validator names what it was not given; a paste is better named
			// for what it is, unless the player named it.
			const named = { ...pattern, name: route.name ?? "Pasted tab", bpm: route.bpm ?? pattern.bpm };
			return {
				text: tabReply("ascii", lang),
				proposal: { name: named.name, pattern: named, bpm: route.bpm, chords: [], warnings: [...route.warnings, ...warnings] },
				lang,
			};
		}
		return {
			text: pick(
				lang,
				`That looks like a tab, but it could not be read: ${errors[0]?.message ?? "no bars in it"}.`,
				`看起来像 tab，但读不出来：${errors[0]?.message ?? "没有小节"}。`,
			),
			lang,
		};
	}

	if (route.path !== "llm") {
		const { reading } = route;
		const refs = reading.chordWords.map((w) => w.chord).filter((c): c is ChordRef => c !== null);
		const voicingFor = await voicings(refs);
		const built = buildTabProposal({
			chordWords: reading.chordWords,
			notes: route.path === "notes" ? reading.notes : null,
			order: route.path === "pick-order" ? reading.order : null,
			duration: reading.duration,
			style: route.path === "style" ? reading.style : null,
			timeSignature: reading.timeSignature,
			bpm: reading.bpm,
			name: reading.name,
			capo: reading.capo,
			voicingFor,
		});
		if (built.ok) {
			const kind =
				route.path === "notes"
					? "notes"
					: route.path === "pick-order"
						? "order"
						: route.path === "style"
							? "style"
							: "chords";
			return { text: tabReply(kind, lang), proposal: built.proposal, lang };
		}
	}

	// String and fret lists that were there but did not pair up: say exactly
	// what was wrong with them, rather than what else could have been typed.
	const reading = readTabSentence(text, index);
	if (reading.notesError !== null) {
		return {
			text: pick(lang, `${reading.notesError}`, `${reading.notesError}`),
			templates: ["string:66544322, fret:8-11-10-8-10-8-8-11", "string:6654, fret:8-11-10-8\nstring:3211, fret:8-8-11-8"],
			lang,
		};
	}

	// Nothing read it whole. Say what was read, and offer the sentences that
	// would have. The record of the miss is kept in the shape strum keeps it.
	const guidance = suggestTab(reading, lang);
	return { text: guidance.text, templates: guidance.templates, seen: explainEditIntent(text, []), lang };
}
