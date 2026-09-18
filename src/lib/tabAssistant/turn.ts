import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { chordSymbolLabel } from "@/lib/fingerpickChords";
import type { ChordRef } from "@/lib/strumPatterns";
import { normalizeImportedPattern } from "@/lib/tabImport";
import { explainEditIntent, type EditIntentExplanation } from "@/lib/strumAssistant/editIntent";
import { detectLang, pick, type Lang } from "@/lib/strumAssistant/lang";
import { smallTalk } from "@/lib/strumAssistant/smallTalk";
import { buildTabProposal } from "@/lib/tabAssistant/buildTabProposal";
import { readTabEdit, tabEditClause, type TabEditReading } from "@/lib/tabAssistant/editIntent";
import { readTabSentence } from "@/lib/tabAssistant/readTabSentence";
import { routeTabInput } from "@/lib/tabAssistant/router";
import { suggestTab } from "@/lib/tabAssistant/suggest";
import type { TabProposal } from "@/lib/tabAssistant/types";
import { correctionsNote } from "@/lib/strumAssistant/fuzzy";
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
	/**
	 * Bars for a pattern the player already has, read and built but not
	 * written: the player confirms first. Only the readings with bars in them
	 * reach the panel as a card; the rest are said in `text`.
	 */
	edit?: Extract<TabEditReading, { kind: "append" | "replace" | "chords" | "rename" | "delete" | "set" }>;
	templates?: string[];
	lang: Lang;
	/** With `templates`: what the readers saw, for the record that turns misses into eval cases. */
	seen?: EditIntentExplanation;
}

export interface ResolveTabTurnInput {
	text: string;
	index: readonly ChordIndexEntry[];
	/** Every pattern a name can refer to: the shipped ones and the player's own. */
	patterns?: readonly FingerpickPattern[];
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

/** What the assistant says about an edit it has read. Written here, never asked for. */
export function tabEditMessage(edit: TabEditReading, lang: Lang, presets: readonly FingerpickPattern[]): string {
	const q = (name: string) => (lang === "zh" ? `「${name}」` : `"${name}"`);
	const bars = (n: number) => pick(lang, `${n} bar${n === 1 ? "" : "s"}`, `${n} 小节`);
	switch (edit.kind) {
		case "append":
		case "replace": {
			const preset = presets.some((p) => p.id === edit.pattern.id);
			const what =
				edit.kind === "append"
					? pick(lang, `Add ${bars(edit.measures.length)} to the end of ${q(edit.pattern.name)}?`, `把 ${bars(edit.measures.length)}加到${q(edit.pattern.name)}的末尾？`)
					: pick(
							lang,
							`Replace bar ${edit.barIndex + 1} of ${q(edit.pattern.name)} with ${edit.measures.length === 1 ? "this" : `these ${bars(edit.measures.length)}`}?`,
							`把${q(edit.pattern.name)}的第 ${edit.barIndex + 1} 小节换成${edit.measures.length === 1 ? "这一小节" : `这 ${bars(edit.measures.length)}`}？`,
						);
			const note = preset
				? pick(lang, " It is a shipped pattern, so this saves a copy of your own.", " 这是内置 pattern，所以会另存一份你自己的。")
				: pick(lang, " Nothing is saved until you say so.", " 你确认之前什么都不会保存。");
			return what + note;
		}
		case "chords": {
			const preset = presets.some((p) => p.id === edit.pattern.id);
			const labels = edit.marks.map((m) => chordSymbolLabel(m.chord));
			const first = edit.marks[0];
			// One run on the first beat reads as a range; anything else is said
			// mark by mark, beat included where it is not the first.
			const oneRun =
				edit.marks.every((m) => m.beat === first?.beat) &&
				edit.marks.every((m, i) => i === 0 || m.bar === edit.marks[i - 1].bar + 1);
			const where =
				edit.marks.length === 1
					? pick(lang, `bar ${first.bar}`, `第 ${first.bar} 小节`)
					: pick(lang, `bars ${first.bar}–${edit.marks[edit.marks.length - 1].bar}`, `第 ${first.bar}–${edit.marks[edit.marks.length - 1].bar} 小节`);
			const beat = first && first.beat !== 1 ? pick(lang, `, beat ${first.beat}`, `第 ${first.beat} 拍`) : "";
			const each = edit.marks
				.map((m) =>
					pick(
						lang,
						`${chordSymbolLabel(m.chord)} on bar ${m.bar}${m.beat !== 1 ? ` beat ${m.beat}` : ""}`,
						`第 ${m.bar} 小节${m.beat !== 1 ? `第 ${m.beat} 拍` : ""} ${chordSymbolLabel(m.chord)}`,
					),
				)
				.join(pick(lang, ", ", "、"));
			// A range longer than the chords: the last chord holds to its end.
			const lastBar = edit.barIndex + edit.measures.length;
			const lastMark = edit.marks[edit.marks.length - 1];
			const holding =
				lastMark && lastBar > lastMark.bar
					? pick(lang, `, ${chordSymbolLabel(lastMark.chord)} holding to bar ${lastBar}`, `，${chordSymbolLabel(lastMark.chord)} 延续到第 ${lastBar} 小节`)
					: "";
			const what =
				edit.marks.length === 0
					? pick(lang, `None of those chords matched — nothing to mark on ${q(edit.pattern.name)}.`, `这些和弦都没匹配上——${q(edit.pattern.name)}上没有可标的。`)
					: oneRun
						? pick(
								lang,
								`Mark ${labels.join(" ")} on ${where}${beat}${holding} of ${q(edit.pattern.name)}?`,
								`在${q(edit.pattern.name)}的${where}${beat}标上 ${labels.join(" ")}${holding}？`,
							)
						: pick(lang, `Mark ${each}${holding} of ${q(edit.pattern.name)}?`, `在${q(edit.pattern.name)}标上：${each}${holding}？`);
			const note =
				edit.marks.length === 0
					? ""
					: preset
						? pick(lang, " It is a shipped pattern, so this saves a copy of your own.", " 这是内置 pattern，所以会另存一份你自己的。")
						: pick(lang, " Nothing is saved until you say so.", " 你确认之前什么都不会保存。");
			return what + note;
		}
		case "beat-out-of-range":
			return pick(
				lang,
				`${q(edit.pattern.name)} is in ${edit.pattern.timeSignature[0]}/${edit.pattern.timeSignature[1]} — there is no beat ${edit.beat}.`,
				`${q(edit.pattern.name)}是 ${edit.pattern.timeSignature[0]}/${edit.pattern.timeSignature[1]} 拍，没有第 ${edit.beat} 拍。`,
			);
		case "chords-mismatch":
			return pick(
				lang,
				`${edit.chords} chords for ${edit.bars} bars — that is more chords than bars. Write one per bar, or fewer and the last will hold.`,
				`${edit.bars} 个小节却有 ${edit.chords} 个和弦——和弦比小节多。每小节一个，或者少写几个，最后一个会延续。`,
			);
		case "rename":
			if (presets.some((p) => p.id === edit.pattern.id)) {
				return pick(
					lang,
					`${q(edit.pattern.name)} is one of the shipped patterns, and those keep their names. Your own patterns can be renamed.`,
					`${q(edit.pattern.name)}是内置 pattern，名字改不了。你自己建的可以改名。`,
				);
			}
			return edit.newName === ""
				? pick(lang, `Rename ${q(edit.pattern.name)} — to what?`, `把${q(edit.pattern.name)}改名——改成什么？`)
				: pick(lang, `Rename ${q(edit.pattern.name)} to ${q(edit.newName)}?`, `把${q(edit.pattern.name)}改名为${q(edit.newName)}？`);
		case "delete":
			if (presets.some((p) => p.id === edit.pattern.id)) {
				return pick(
					lang,
					`${q(edit.pattern.name)} is one of the shipped patterns and cannot be deleted.`,
					`${q(edit.pattern.name)}是内置 pattern，删不了。`,
				);
			}
			return pick(
				lang,
				`Delete ${q(edit.pattern.name)}? It cannot be undone.`,
				`删除${q(edit.pattern.name)}？删了就回不来了。`,
			);
		case "set": {
			const preset = presets.some((p) => p.id === edit.pattern.id);
			const parts: string[] = [];
			if (edit.timeSignature) parts.push(`${edit.timeSignature[0]}/${edit.timeSignature[1]}`);
			if (edit.bpm !== null) parts.push(`${edit.bpm} BPM`);
			const what = pick(
				lang,
				`Set ${q(edit.pattern.name)} to ${parts.join(pick(lang, " at ", "，"))}?`,
				`把${q(edit.pattern.name)}设为 ${parts.join("，")}？`,
			);
			const loss =
				edit.affectedBars.length > 0
					? pick(
							lang,
							` Bar${edit.affectedBars.length === 1 ? "" : "s"} ${edit.affectedBars.join(", ")} would lose the notes that no longer fit.`,
							` 第 ${edit.affectedBars.join("、")} 小节里装不下的音会丢掉。`,
						)
					: "";
			const note = preset
				? pick(lang, " It is a shipped pattern, so this saves a copy of your own.", " 这是内置 pattern，所以会另存一份你自己的。")
				: pick(lang, " Nothing is saved until you say so.", " 你确认之前什么都不会保存。");
			return what + loss + note;
		}
		case "value-unread":
			return pick(
				lang,
				`Read the change to ${q(edit.pattern.name)}, but not what to set: “${edit.value}”. A tempo (90 bpm) or a meter (3/4, 6/8) is what I can set.`,
				`读到了要改${q(edit.pattern.name)}，但没读懂改成什么：“${edit.value}”。我能设的是速度（90 bpm）或拍号（3/4、6/8）。`,
			);
		case "ambiguous":
			return pick(
				lang,
				`${edit.matches.length} patterns match ${q(edit.name)}: ${edit.matches.map((m) => q(m.name)).join(", ")}. Which one did you mean? Say its full name.`,
				`有 ${edit.matches.length} 个 pattern 匹配${q(edit.name)}：${edit.matches.map((m) => q(m.name)).join("、")}。指的是哪个？说全名。`,
			);
		case "unknown-pattern":
			return pick(
				lang,
				`You have no pattern called ${q(edit.name)}. Check the name in the library.`,
				`你没有叫${q(edit.name)}的 pattern，去库里核对一下名字。`,
			);
		case "bar-out-of-range":
			return pick(
				lang,
				`${q(edit.pattern.name)} has ${bars(edit.pattern.measures.length)} — there is no bar ${edit.bar}.`,
				`${q(edit.pattern.name)}只有 ${bars(edit.pattern.measures.length)}，没有第 ${edit.bar} 小节。`,
			);
		case "segment-unread":
			return pick(
				lang,
				`Read the edit to ${q(edit.pattern.name)}, but not this bar: “${edit.segment}”. Write each bar as strings and frets, a chord with an order, or a style word over a chord.`,
				`读到了要改${q(edit.pattern.name)}，但这一段没读懂：“${edit.segment}”。每小节写成弦号和品格、和弦加顺序，或风格词加和弦。`,
			);
		case "nothing-to-write":
			return pick(
				lang,
				`Read the edit to ${q(edit.pattern.name)}, but no bars came after the colon.`,
				`读到了要改${q(edit.pattern.name)}，但冒号后面没有小节。`,
			);
	}
}

export async function resolveTabTurn({
	text,
	index,
	patterns = PRESET_FINGERPICK_PATTERNS,
	uiLang = "en",
	voicings = loadVoicingLookup,
}: ResolveTabTurnInput): Promise<TabTurnOutcome> {
	const lang = detectLang(text, uiLang);

	const talk = smallTalk(text, lang);
	if (talk) return { text: talk.text, templates: talk.templates.length ? talk.templates : undefined, lang };

	// An edit names its target, so it is read before anything else: "add to
	// travis: Am: 5 3 2 1" is a chord line to every reader after this one.
	const clause = tabEditClause(text);
	if (clause) {
		const refs = clause.spec
			.split(/[;；\n]+/)
			.flatMap((segment) => readTabSentence(segment, index).chordWords)
			.map((w) => w.chord)
			.filter((c): c is ChordRef => c !== null);
		const voicingFor = await voicings(refs);
		const edit = readTabEdit({ text, index, patterns, voicingFor });
		if (edit) {
			const message = tabEditMessage(edit, lang, PRESET_FINGERPICK_PATTERNS);
			const preset = PRESET_FINGERPICK_PATTERNS.some((p) => "pattern" in edit && p.id === edit.pattern.id);
			const card =
				edit.kind === "append" ||
				edit.kind === "replace" ||
				(edit.kind === "chords" && edit.marks.length > 0) ||
				(edit.kind === "rename" && !preset && edit.newName !== "") ||
				(edit.kind === "delete" && !preset) ||
				edit.kind === "set";
			return card
				? { text: message, edit: edit as NonNullable<TabTurnOutcome["edit"]>, lang }
				: {
						text: message,
						lang,
						templates:
							edit.kind === "rename" || edit.kind === "delete"
								? undefined
								: [
										"add to ___: string:6654, fret:8-11-10-8",
										"replace bar 1 of ___: Am: 5 3 2 1",
										"add chord Am to bar 1 of ___",
										"set ___ to 90 bpm",
									],
					};
		}
	}

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
			return { text: correctionsNote(reading.corrections, lang) + tabReply(kind, lang), proposal: built.proposal, lang };
		}
	}

	// String and fret lists that were there but did not pair up: say exactly
	// what was wrong with them, rather than what else could have been typed.
	const reading = readTabSentence(text, index);
	if (reading.notesError !== null) {
		return {
			text: correctionsNote(reading.corrections, lang) + reading.notesError,
			templates: ["string:66544322, fret:8-11-10-8-10-8-8-11", "string:6654, fret:8-11-10-8\nstring:3211, fret:8-8-11-8"],
			lang,
		};
	}

	// Nothing read it whole. Say what was read, and offer the sentences that
	// would have. The record of the miss is kept in the shape strum keeps it.
	const guidance = suggestTab(reading, lang);
	return { text: guidance.text, templates: guidance.templates, seen: explainEditIntent(text, []), lang };
}
