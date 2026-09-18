"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { fetchCustomPatterns } from "@/components/strum/useStrumPatterns";
import { PRESET_STRUM_PATTERNS, type StrumPattern } from "@/lib/strumPatterns";
import { resolveAssistantTurn } from "@/lib/assistant/strum/turn";
import { recordMiss } from "@/lib/assistant/missLog";
import { uiLang, type Lang } from "@/lib/assistant/lang";
import type { AssistantDomain, AssistantProposal } from "@/lib/assistant/types";
import type { EditIntentExplanation, EditIntentReading } from "@/lib/assistant/strum/editIntent";
import { resolveTabTurn, type TabTurnOutcome } from "@/lib/assistant/tab/turn";
import type { TabProposal } from "@/lib/assistant/tab/types";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { loadUserFingerpickPatterns } from "@/lib/fingerpickPatternSync";
import { getUser } from "@/lib/auth";
import {
	IDLE_MS,
	isIdle,
	readConversation,
	readMode,
	writeConversation,
	writeMode,
} from "@/lib/assistant/conversation";
import { otherDomainReads } from "@/lib/assistant/readAs";
import { createClient } from "@/lib/supabase";

/**
 * Drives the assistant conversation.
 *
 * One thread, one mode. The chip above the input says which assistant the
 * thread is talking to — the strum one reads with `resolveAssistantTurn`,
 * the tab one with `resolveTabTurn` — and the choice is the player's, kept
 * with the transcript until they change it or the thread ends. Both read the
 * message by rules and never reach for a model, so every answer is one the
 * app can stand behind, and that can be asserted rather than promised.
 *
 * The page is a default, not a decision: a thread opens in the mode of the
 * page it opens on, and crossing to the other page only prompts — once per
 * page — to switch. The one time the mode is second-guessed is when it
 * plainly failed: the chosen readers made nothing of the sentence and the
 * other assistant's would have; then the reply offers to read it as that one.
 */

const STRUM_PATH = "/strum";
const TAB_PATH = "/fingerpick";

/** The mode a thread opens in on this page. */
export function domainForPath(pathname: string | null): AssistantDomain {
	return pathname === TAB_PATH ? "tab" : "strum";
}

/** The pages that have an assistant of their own — the only ones worth a prompt to switch. */
function hasOwnAssistant(pathname: string | null): boolean {
	return pathname === STRUM_PATH || pathname === TAB_PATH;
}

export interface AssistantMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	/** Which assistant answered; a restored transcript renders the right card by it. Absent on older turns, which were all strum. */
	domain?: AssistantDomain;
	proposal?: AssistantProposal;
	/** The tab assistant's offer: a whole pattern, for the fingerpick editor. */
	tabProposal?: TabProposal;
	/** Bars for a fingerpick pattern the player has, waiting on the player to confirm. */
	tabEdit?: TabTurnOutcome["edit"];
	/** An edit to an existing pattern, waiting on the player to confirm it. */
	edit?: EditIntentReading;
	/** Sentences offered when nothing read the message, with blanks to fill. */
	templates?: string[];
	/** The language this reply was written in; the answers under it follow. */
	lang?: Lang;
	/**
	 * Present when the selected assistant read nothing and the other would
	 * have: the domain to read the sentence as, and the sentence, so one click
	 * switches the mode and answers again.
	 */
	readAs?: { domain: AssistantDomain; text: string };
	/** Set when the turn failed; rendered as an error rather than as speech. */
	failed?: boolean;
	/** True once the edit this message carried was confirmed and handed over. */
	editDone?: boolean;
	/**
	 * True once the panel has typed this message out. Kept on the message, and
	 * therefore in storage, so reopening the panel or refreshing shows the
	 * transcript as it stands rather than replaying it.
	 */
	streamed?: boolean;
}

/** How long the assistant appears to think before it answers. */
const THINK_MIN_MS = 150;
const THINK_MAX_MS = 2000;

function newId(): string {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `m${Date.now()}${Math.random()}`;
}

export function useAssistant() {
	const pathname = usePathname();
	const page = domainForPath(pathname);
	// A ref for the callbacks that must not change identity with the route:
	// `reset` is a dependency of the idle timer, and navigating is not talking.
	const pageRef = useRef(page);
	useEffect(() => {
		pageRef.current = page;
	}, [page]);

	// The mode the thread was left in, or the page's default for a new one.
	// Read once, lazily, on the client — nothing that wears the mode is in the
	// server's markup; the panel mounts on click.
	const [mode, setModeState] = useState<AssistantDomain>(() =>
		typeof window === "undefined" ? page : (readMode() ?? page),
	);
	/**
	 * The page the player was last prompted to switch on. The prompt shows
	 * when the mode and the page disagree, once per page: dismissed by typing
	 * or by choosing a mode — either is an answer — and back again on the
	 * next page that disagrees.
	 */
	const [nudgedPath, setNudgedPath] = useState<string | null>(null);
	const dismissNudge = useCallback(() => setNudgedPath(pathname), [pathname]);

	const setMode = useCallback(
		(next: AssistantDomain) => {
			setModeState(next);
			writeMode(next);
			dismissNudge();
		},
		[dismissNudge],
	);
	const nudge = hasOwnAssistant(pathname) && mode !== page && nudgedPath !== pathname;

	// Read once, lazily. Safe to differ between server and client: nothing that
	// renders the transcript is mounted until the popover opens, so the markup
	// React hydrates against does not depend on this.
	const [messages, setMessages] = useState<AssistantMessage[]>(() =>
		typeof window === "undefined" ? [] : readConversation<AssistantMessage>(Date.now()),
	);
	const [pending, setPending] = useState(false);

	const indexRef = useRef<Promise<readonly ChordIndexEntry[]> | null>(null);
	const patternsRef = useRef<Promise<readonly StrumPattern[]> | null>(null);
	/**
	 * What "belief" can refer to: the shipped patterns plus the player's own.
	 * Read, never written — the strum page owns every write to these. Presets are
	 * in because a progression hangs off a pattern without changing it, and a
	 * shipped rhythm is as good a thing to write chords over as any.
	 */
	const [patterns, setPatterns] = useState<readonly StrumPattern[]>(PRESET_STRUM_PATTERNS);
	/** The chord index, once it has arrived, for the parts of the panel that cannot await. */
	const [index, setIndex] = useState<readonly ChordIndexEntry[]>([]);

	/** Fetched once per session, shared by every parse in this panel. */
	const chordIndex = useCallback(async (): Promise<readonly ChordIndexEntry[]> => {
		if (indexRef.current === null) {
			indexRef.current = getChordIndex().catch((e: unknown) => {
				console.error("[assistant] chord index:", e);
				// Reset so a later turn can retry rather than being stuck empty.
				indexRef.current = null;
				return [] as readonly ChordIndexEntry[];
			});
		}
		return indexRef.current;
	}, []);

	/**
	 * A restored transcript can hold a card that needs the chord index the moment
	 * it renders — and it rendered, once, against an empty one, calling every
	 * chord unplaceable. So the index is fetched as soon as anything needs it.
	 */
	const ensureIndex = useCallback(() => {
		void chordIndex().then(setIndex);
	}, [chordIndex]);

	/**
	 * What "travis" can refer to on the tab side: the shipped patterns plus the
	 * player's own. Read, never written — the fingerpick page owns every write.
	 */
	const tabPatternsRef = useRef<Promise<readonly FingerpickPattern[]> | null>(null);
	const loadTabPatterns = useCallback(async (): Promise<readonly FingerpickPattern[]> => {
		if (tabPatternsRef.current === null) {
			tabPatternsRef.current = (async () => {
				try {
					const user = await getUser();
					const custom = await loadUserFingerpickPatterns(createClient(), user);
					return [...PRESET_FINGERPICK_PATTERNS, ...custom];
				} catch (e) {
					console.error("[assistant] fingerpick patterns:", e);
					tabPatternsRef.current = null;
					return PRESET_FINGERPICK_PATTERNS;
				}
			})();
		}
		return tabPatternsRef.current;
	}, []);

	/** Read on the first turn, not on mount: a panel nobody types in costs nothing. */
	const loadPatterns = useCallback(async (): Promise<readonly StrumPattern[]> => {
		if (patternsRef.current === null) {
			patternsRef.current = fetchCustomPatterns().then((custom) => {
				const all: readonly StrumPattern[] = [...PRESET_STRUM_PATTERNS, ...custom];
				setPatterns(all);
				return all;
			});
		}
		return patternsRef.current;
	}, []);

	/** Changes when the conversation is cleared — what a fresh greeting keys on. */
	const [sessionId, setSessionId] = useState(newId);
	/**
	 * Whether the greeting has played out for this conversation. Kept here, where
	 * the panel's closing does not reach: a greeting that typed itself out again
	 * every time the popover reopened would stop being one.
	 */
	const [greeted, setGreeted] = useState(false);
	const markGreeted = useCallback(() => setGreeted(true), []);

	const reset = useCallback(() => {
		setMessages([]);
		setSessionId(newId());
		setGreeted(false);
		// A new thread opens in the page's mode, as the first one did.
		setModeState(pageRef.current);
		writeMode(null);
	}, []);

	/**
	 * When the transcript last changed. A ref, not state: it is read by the
	 * idle check on opening and written by the persist effect, and nothing
	 * renders from it. Starts at 0 — "never" — and is stamped by the persist
	 * effect on mount, before anything can open the panel.
	 */
	const touchedAtRef = useRef(0);

	// Persist on every change, and start the silence clock over. Ten minutes
	// without a change ends the conversation — see `conversation.ts` for why.
	// The timer is cleared on the next change and on unmount, so at most one is
	// ever pending.
	useEffect(() => {
		const now = Date.now();
		touchedAtRef.current = now;
		writeConversation(messages, now);
		if (messages.length === 0) return;
		const timer = setTimeout(reset, IDLE_MS);
		return () => clearTimeout(timer);
	}, [messages, reset]);

	/**
	 * For the moment the panel opens: a timer that fired late (a laptop asleep,
	 * a throttled background tab) is caught up here, so what opens after a long
	 * silence is a fresh greeting, never a stale thread.
	 */
	const expireIfIdle = useCallback(() => {
		if (messages.length > 0 && isIdle(touchedAtRef.current, Date.now())) reset();
	}, [messages.length, reset]);

	// A change of who is signed in ends the conversation: the transcript may
	// name the previous person's patterns, and the greeting is by name. Keyed on
	// the user id rather than the event: `SIGNED_IN` also fires when a tab
	// regains focus, which is nobody new.
	useEffect(() => {
		const supabase = createClient();
		// `undefined` until the first event: the initial session is the baseline,
		// not a change.
		let known: string | null | undefined;
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			const id = session?.user.id ?? null;
			if (known === undefined) {
				known = id;
				return;
			}
			if (id !== known) {
				known = id;
				reset();
			}
		});
		return () => subscription.unsubscribe();
	}, [reset]);

	/** The edit this message carried has been confirmed — the card stays settled. */
	const markEditDone = useCallback((id: string) => {
		setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, editDone: true } : m)));
	}, []);

	/** The panel has finished typing this message out. */
	const markStreamed = useCallback((id: string) => {
		setMessages((prev) =>
			prev.map((m) => (m.id === id && !m.streamed ? { ...m, streamed: true } : m)),
		);
	}, []);

	/**
	 * One sentence, read by one assistant. The reading is instant; the reply
	 * is not. A pause of the kind a person takes before answering — random,
	 * so it never reads as a timer — with the typing dots showing for it. The
	 * floor keeps the dots from flashing for a frame and vanishing. A tab turn
	 * may also wait on the chord library for its shapes; the pause runs alongside.
	 */
	const resolveIn = useCallback(
		async (as: AssistantDomain, text: string): Promise<AssistantMessage> => {
			const [index, patternList] = await Promise.all([chordIndex(), loadPatterns()]);
			setIndex(index);
			const thinking = new Promise((done) =>
				setTimeout(done, THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS)),
			);
			const reply: AssistantMessage = { id: newId(), role: "assistant", text: "", domain: as };
			let missed: { seen: EditIntentExplanation; offered: string[] } | null = null;
			let tabPatterns: readonly FingerpickPattern[];
			if (as === "tab") {
				// Re-read per turn rather than cached for the session: a pattern
				// saved on the page since the last turn has to be nameable now.
				tabPatternsRef.current = null;
				tabPatterns = await loadTabPatterns();
				const outcome = await resolveTabTurn({ text, index, patterns: tabPatterns, uiLang: uiLang() });
				if (outcome.seen && outcome.templates) missed = { seen: outcome.seen, offered: outcome.templates };
				Object.assign(reply, {
					text: outcome.text,
					tabProposal: outcome.proposal,
					tabEdit: outcome.edit,
					templates: outcome.templates,
					lang: outcome.lang,
				});
			} else {
				tabPatterns = await loadTabPatterns();
				const outcome = resolveAssistantTurn({ text, index, patterns: patternList, uiLang: uiLang() });
				if (outcome.seen && outcome.templates) missed = { seen: outcome.seen, offered: outcome.templates };
				Object.assign(reply, {
					text: outcome.text,
					proposal: outcome.proposal,
					edit: outcome.edit,
					templates: outcome.templates,
					lang: outcome.lang,
					...(outcome.failed ? { failed: true } : {}),
				});
			}
			// Nothing concrete came of it — no card, or a card that only says the
			// name is unknown here. If the other assistant would have read the
			// sentence whole, the reply says so, and offers to.
			const hasCard =
				reply.proposal !== undefined ||
				reply.tabProposal !== undefined ||
				reply.tabEdit !== undefined ||
				(reply.edit !== undefined && reply.edit.kind !== "unknown-pattern");
			const other =
				hasCard || reply.failed
					? null
					: otherDomainReads(as, text, { index, strumPatterns: patternList, tabPatterns });
			if (other) reply.readAs = { domain: other, text };
			// A sentence nothing read is worth keeping: it is the next eval case,
			// and the sentence picked after it is what the rules should have read.
			if (missed) recordMiss(text, missed.seen, missed.offered, { mode: as, readAs: other });
			await thinking;
			return reply;
		},
		[chordIndex, loadPatterns, loadTabPatterns],
	);

	const send = useCallback(
		async (input: string) => {
			const text = input.trim();
			if (text === "" || pending) return;

			const userMessage: AssistantMessage = { id: newId(), role: "user", text };
			setMessages((prev) => [...prev, userMessage]);
			setPending(true);
			// Talking settles the mode: a thread that has been spoken to keeps its
			// assistant across pages, where an untouched one still follows the page.
			writeMode(mode);
			try {
				const reply = await resolveIn(mode, text);
				setMessages((prev) => [...prev, reply]);
			} finally {
				setPending(false);
			}
		},
		[mode, pending, resolveIn],
	);

	/**
	 * The offer taken: the thread switches to the other assistant and the
	 * sentence is read again by it. The reply that made the offer is replaced,
	 * not followed — the sentence was asked once.
	 */
	const readAs = useCallback(
		async (messageId: string, as: AssistantDomain, text: string) => {
			if (pending) return;
			setMode(as);
			setPending(true);
			try {
				const reply = await resolveIn(as, text);
				setMessages((prev) => prev.map((m) => (m.id === messageId ? reply : m)));
			} finally {
				setPending(false);
			}
		},
		[pending, resolveIn, setMode],
	);

	return {
		mode,
		setMode,
		page,
		nudge,
		dismissNudge,
		messages,
		pending,
		send,
		readAs,
		reset,
		expireIfIdle,
		markStreamed,
		markEditDone,
		patterns,
		index,
		ensureIndex,
		sessionId,
		greeted,
		markGreeted,
	};
}
