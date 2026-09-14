"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { fetchCustomPatterns } from "@/components/strum/useStrumPatterns";
import { PRESET_STRUM_PATTERNS, type StrumPattern } from "@/lib/strumPatterns";
import { resolveAssistantTurn } from "@/lib/strumAssistant/turn";
import { recordMiss } from "@/lib/strumAssistant/missLog";
import { uiLang, type Lang } from "@/lib/strumAssistant/lang";
import type { AssistantProposal } from "@/lib/strumAssistant/types";
import type { EditIntentReading } from "@/lib/strumAssistant/editIntent";
import { IDLE_MS, isIdle, readConversation, writeConversation } from "@/lib/strumAssistant/conversation";
import { createClient } from "@/lib/supabase";

/**
 * Drives one assistant conversation.
 *
 * The conversation's state lives here; deciding a turn lives in
 * `resolveAssistantTurn`, which reads the message by rules and never reaches
 * for the network — so every answer is one the app can stand behind, and that
 * can be asserted rather than promised.
 */

export interface AssistantMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	proposal?: AssistantProposal;
	/** An edit to an existing pattern, waiting on the player to confirm it. */
	edit?: EditIntentReading;
	/** Sentences offered when nothing read the message, with blanks to fill. */
	templates?: string[];
	/** The language this reply was written in; the answers under it follow. */
	lang?: Lang;
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

	const send = useCallback(
		async (input: string) => {
			const text = input.trim();
			if (text === "" || pending) return;

			const userMessage: AssistantMessage = { id: newId(), role: "user", text };
			setMessages((prev) => [...prev, userMessage]);
			setPending(true);

			try {
				const [index, patternList] = await Promise.all([chordIndex(), loadPatterns()]);
				setIndex(index);
				const outcome = resolveAssistantTurn({ text, index, patterns: patternList, uiLang: uiLang() });
				// The reading is instant; the reply is not. A pause of the kind a
				// person takes before answering — random, so it never reads as a
				// timer — with the typing dots showing for it. The floor keeps the
				// dots from flashing for a frame and vanishing.
				await new Promise((done) =>
					setTimeout(done, THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS)),
				);
				// A sentence nothing read is worth keeping: it is the next eval case,
				// and the sentence picked after it is what the rules should have read.
				if (outcome.seen && outcome.templates) recordMiss(text, outcome.seen, outcome.templates);
				setMessages((prev) => [
					...prev,
					{
						id: newId(),
						role: "assistant",
						text: outcome.text,
						proposal: outcome.proposal,
						edit: outcome.edit,
						templates: outcome.templates,
						lang: outcome.lang,
						...(outcome.failed ? { failed: true } : {}),
					},
				]);
			} finally {
				setPending(false);
			}
		},
		[chordIndex, loadPatterns, pending],
	);

	return {
		messages,
		pending,
		send,
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
