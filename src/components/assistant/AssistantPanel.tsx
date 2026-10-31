"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowDownUp, ArrowRightLeft, ArrowUp, ArrowUpRight, BookOpen, Lock, Rows3, Sparkles, Square, X, Zap } from "lucide-react";
import ProposalPreview from "./strum/ProposalPreview";
import TabProposalPreview from "./tab/TabProposalPreview";
import TabEditCard from "./tab/TabEditCard";
import EditIntentCard from "./strum/EditIntentCard";
import ChordShapeCard from "./ChordShapeCard";
import ReplyMarkdown from "./ReplyMarkdown";
import ChatLibrary, { SaveLine } from "./ChatLibrary";
import { Option, Options } from "./Options";
import { Button } from "@/components/ui/button";
import { Pick } from "@/components/ui/pick";
import { usePress } from "@/components/ui/press";
import { Segmented } from "@/components/ui/segmented";
import { BLANK } from "@/lib/assistant/blank";
import { recordPick } from "@/lib/assistant/missLog";
import { prefersReducedMotion } from "@/lib/motion";
import { hasCoarsePointer } from "@/lib/pointer";
import { greeting, hint as introHint, playerName, inputPrompts, examples } from "@/lib/assistant/greeting";
import { pick, uiLang } from "@/lib/assistant/lang";
import { modelDisplayName } from "@/lib/assistant/general/request";
import { locateBookPage, locateBookPageOnArrival } from "@/lib/assistant/bookContext";
import { modeModule, replyModule, statusLine } from "@/lib/assistant/panelView";
import { parseReply, visibleLength } from "@/lib/assistant/markdown";
import { hasModelReply } from "@/lib/assistant/chatLibrary";
import type { AssistantDomain, AssistantMode } from "@/lib/assistant/types";
import { useUser } from "@/hooks/useUser";
import type { useAssistant } from "./useAssistant";
import { useNavRouter } from "@/components/nav-progress";

/**
 * The conversation, rendered. The state is the launcher's — this only mounts
 * while the popover is open, and a conversation that ended every time the
 * popover closed would be no conversation at all.
 */

const MAX_INPUT_CHARS = 600;
/** The chip's segments, in the order they sit; Book joins them while a chapter is open. */
const MODES: readonly AssistantMode[] = ["strum", "tab", "general"];
const MODE_LABEL: Record<AssistantMode, string> = { strum: "Strum", tab: "Tab", general: "General", book: "Book" };
const MODE_ICON: Record<AssistantMode, typeof Sparkles> = { strum: ArrowDownUp, tab: Rows3, general: Sparkles, book: BookOpen };
const MODE_LABEL_ZH: Record<AssistantDomain, string> = { strum: "扫弦", tab: "指弹" };
/** How far above the bottom still counts as reading the tail, so a stray pixel does not unpin. */
const TAIL_SLACK_PX = 24;
/** How long after a wheel, touch, key or scrollbar press a scroll still counts as the reader's. */
const USER_SCROLL_WINDOW_MS = 500;

/** Five lines of the field's own text, after which it scrolls instead of growing. */
const MAX_INPUT_HEIGHT_PX = 104;
/** Long enough to read one, short enough to see there are others. */
const PROMPT_ROTATION_MS = 4500;

/** How long a whole message takes to type itself out, and how often it ticks. */
const REVEAL_MS = 900;
const TICK_MS = 24;

/**
 * A message, typed out rather than pasted in.
 *
 * The reply arrives whole — the endpoint returns one JSON object — but reading
 * it should feel like being answered, not like being handed a printout. The
 * pace is the message's own: a short line and a long one both take about a
 * second, so the panel never makes anyone wait on an animation.
 */
function StreamedText({
	text,
	markdown = false,
	animate,
	onTick,
	onDone,
}: {
	text: string;
	/** Read the text as Markdown — a model's reply; the readers' words are plain. */
	markdown?: boolean;
	animate: boolean;
	onTick: () => void;
	onDone: () => void;
}) {
	const tree = useMemo(() => (markdown ? parseReply(text) : null), [markdown, text]);
	// What the typing reveals: the formatted words, not the markup around them.
	const total = tree ? visibleLength(tree) : text.length;
	const [shown, setShown] = useState(() => (animate ? 0 : total));
	// Held in a ref so a new callback identity cannot restart the typing.
	const callbacks = useRef({ onTick, onDone });
	useEffect(() => {
		callbacks.current = { onTick, onDone };
	});

	useEffect(() => {
		if (!animate) return;
		// Reduced motion takes the same path with one step: the message lands
		// whole, and everything waiting on the end of it still fires.
		const step = prefersReducedMotion() ? total : Math.max(1, Math.ceil(total / (REVEAL_MS / TICK_MS)));
		let revealed = 0;
		const timer = setInterval(() => {
			revealed = Math.min(total, revealed + step);
			setShown(revealed);
			callbacks.current.onTick();
			if (revealed >= total) {
				clearInterval(timer);
				callbacks.current.onDone();
			}
		}, TICK_MS);
		return () => clearInterval(timer);
	}, [animate, total]);

	return tree ? <ReplyMarkdown tree={tree} shown={shown} /> : <>{text.slice(0, shown)}</>;
}

/** The assistant's mark at the foot of each thing it says: a pick in the reply's colour. */
function Who() {
	return <Pick className="as-who" />;
}

/** The assistant, mid-sentence: a bubble of dots, in the colour of the mode it is answering in. */
function TypingBubble({ mode }: { mode: AssistantMode }) {
	return (
		<div className="as-row" data-m={modeModule(mode)}>
			<Who />
			<div className="as-stack">
				<div className="as-bub">
					<span className="as-typing" aria-label="Writing a reply">
						<i />
						<i />
						<i />
					</span>
				</div>
			</div>
		</div>
	);
}

/** How long the assistant appears to think before it says hello. */
const INTRO_TYPING_MS = 1400;

/** An example under the greeting: a sentence to send as it is. */
function Example({ order, onClick, children }: { order: number; onClick: () => void; children: string }) {
	const pressRef = usePress<HTMLButtonElement>();
	return (
		<button
			ref={pressRef}
			type="button"
			onClick={onClick}
			className="gp-chip gp-press gp-tone-neutral as-opt"
			// Each one lands a beat after the last. backwards fill keeps it
			// invisible until its own animation starts.
			style={{ animationDelay: `${order * 0.14}s` }}
		>
			{children}
		</button>
	);
}

/**
 * An empty conversation, arriving the way a reply does.
 *
 * The greeting is not a heading: it is the assistant's first turn, and it
 * comes the way every turn after it will — a pause, then typed out, then the
 * next line. The examples follow once it has finished speaking, one after
 * another, as things offered rather than as a menu that was always there.
 *
 * Four phases: thinking, greeting, hint, offered. Something that has already
 * been greeted starts at the last one; so does anyone who asked for less motion.
 */
function Intro({
	hello,
	aside,
	domain,
	greeted,
	onGreeted,
	onExample,
	onTick,
}: {
	hello: string;
	/** The line after the greeting: what this does, and for a guest, where their work lives. */
	aside: string;
	domain: AssistantMode;
	greeted: boolean;
	onGreeted: () => void;
	onExample: (text: string) => void;
	onTick: () => void;
}) {
	const [phase, setPhase] = useState<0 | 1 | 2 | 3>(() =>
		greeted || prefersReducedMotion() ? 3 : 0,
	);

	useEffect(() => {
		if (phase !== 0) return;
		const timer = setTimeout(() => setPhase(1), INTRO_TYPING_MS);
		return () => clearTimeout(timer);
	}, [phase]);

	if (phase === 0) return <TypingBubble mode={domain} />;

	return (
		<div className="as-reply" data-m={modeModule(domain)}>
			<div className="as-row">
				<Who />
				<div className="as-stack">
					{/* One group: the greeting opens it, the hint closes it with the tail. */}
					<div className="as-bub" data-lead="" data-pos={phase >= 2 ? "top" : undefined}>
						<StreamedText text={hello} animate={phase === 1} onTick={onTick} onDone={() => setPhase(2)} />
					</div>
					{phase >= 2 && (
						<div className="as-bub" data-soft="" data-pos="end">
							<StreamedText
								text={aside}
								animate={phase === 2}
								onTick={onTick}
								onDone={() => {
									setPhase(3);
									onGreeted();
								}}
							/>
						</div>
					)}
				</div>
			</div>
			{phase === 3 && (
				<div className="as-after">
					<div className="as-opts">
						{examples(domain).map((example, i) => (
							<Example key={example} order={i} onClick={() => onExample(example)}>
								{example}
							</Example>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

export default function AssistantPanel({
	assistant,
	height,
	view,
	onView,
}: {
	assistant: ReturnType<typeof useAssistant>;
	/** Set by the launcher's grip; the panel only wears it. */
	height: number;
	/** The thread, or the saved chats in its place (#401); the head's Chats button switches. */
	view: "thread" | "chats";
	onView: (view: "thread" | "chats") => void;
}) {
	const {
		mode,
		setMode,
		bookContext,
		guestQuota,
		nudge,
		nudgeTo,
		dismissNudge,
		messages,
		pending,
		send,
		readAs,
		stop,
		markStreamed,
		markEditDone,
		patterns,
		index,
		ensureIndex,
		sessionId,
		greeted,
		markGreeted,
		savedChatId,
		saveState,
		savedLineHidden,
		hideSavedLine,
		saveChat,
		openChat,
		forgetChat,
	} = assistant;
	const [draft, setDraft] = useState("");
	/**
	 * General is the model. A guest has a few free turns a day; once they
	 * are used the segment locks, and pointing at it, or pressing it, says
	 * why and where to sign in — rather than a greyed button that explains
	 * nothing, or a refusal after typing.
	 */
	const [askedForGeneral, setAskedForGeneral] = useState(false);
	const router = useNavRouter();
	const pathname = usePathname();
	const scrollRef = useRef<HTMLDivElement | null>(null);
	/** The conversation itself, inside the scrolling frame — what is watched for growth. */
	const contentRef = useRef<HTMLDivElement | null>(null);
	/** Whether the reader is at the tail, and so should be carried along as it grows. */
	const pinnedRef = useRef(true);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const promptHintId = useId();
	const { user } = useUser();
	const guestUsedUp = user === null && guestQuota !== null && guestQuota.used >= guestQuota.limit;
	const modes: readonly AssistantMode[] = bookContext ? [...MODES, "book"] : MODES;

	/**
	 * A page an answer cites, clicked: the book page opens it beside the book
	 * when it is the page on screen; from anywhere else, go there first.
	 */
	function openPage(book: NonNullable<(typeof messages)[number]["book"]>, page: number) {
		const detail = { bookId: book.bookId, chapterId: book.chapterId, page };
		if (pathname === `/books/${book.bookId}`) {
			locateBookPage(detail);
		} else {
			locateBookPageOnArrival(detail);
			router.push(`/books/${book.bookId}`);
		}
	}

	// Picked once per conversation rather than per render: a line that changed
	// while being read would be a tic, not a greeting.
	// The greeting speaks the interface's language — nothing has been said yet
	// to follow — and to a guest it never uses a name, having none to use.
	const lang = uiLang();
	const name = user ? playerName(user.user_metadata, user.email) : null;
	const hello = useMemo(() => greeting(name, sessionId, lang), [name, sessionId, lang]);
	const aside = introHint(lang, user !== null, mode);

	// The examples take turns while there is nothing typed. Tab takes the one on
	// screen — only while the field is empty, so Tab still leaves a field with
	// something in it, and Shift+Tab always walks back the way it should.
	const [promptSlot, setPromptSlot] = useState(0);
	const prompts = inputPrompts(mode);
	const hint = draft === "" ? prompts[promptSlot % prompts.length] : "";
	useEffect(() => {
		if (draft !== "") return;
		const timer = setInterval(() => setPromptSlot((slot) => slot + 1), PROMPT_ROTATION_MS);
		return () => clearInterval(timer);
	}, [draft]);

	// Up and Down walk back through what the player has sent, the way a shell
	// does: a request worth repeating is usually one worth editing first. Only
	// from an empty field — anything typed is a draft, and arrows in a draft are
	// arrows. No wrapping: Down from empty goes nowhere, Up from the oldest stays.
	const sent = messages.filter((m) => m.role === "user").map((m) => m.text);
	const recallRef = useRef<number | null>(null);

	function recall(direction: -1 | 1): boolean {
		const browsing = recallRef.current;
		if (browsing === null) {
			if (draft !== "" || direction === 1 || sent.length === 0) return false;
			return show(sent.length - 1);
		}
		const index = browsing + direction;
		if (index < 0) return true;
		if (index >= sent.length) {
			// Walked past the newest: back to the empty field this started from.
			recallRef.current = null;
			setDraft("");
			return true;
		}
		return show(index);
	}

	function show(index: number): boolean {
		recallRef.current = index;
		setDraft(sent[index]);
		// The caret lands at the end, as it would after typing it.
		requestAnimationFrame(() => {
			const field = inputRef.current;
			if (field) field.setSelectionRange(field.value.length, field.value.length);
		});
		return true;
	}

	// The field grows with what is in it and then stops, because a panel that is
	// mostly composer is no longer a conversation.
	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`;
	}, [draft]);

	/** Keep the newest turn on screen — called per message and per typed tick. */
	const followTail = useCallback(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
		pinnedRef.current = true;
	}, []);

	useEffect(followTail, [messages, pending, followTail]);

	// The conversation grows after the turn that added to it has rendered — a
	// preview drawing its stave, a template row popping in, the typing dots —
	// and each growth would leave the tail below the fold. So the tail is
	// followed whenever the content's height changes, as long as the reader
	// was at the bottom: someone who scrolled up to re-read an earlier turn
	// stays where they are until the next message pins them again.
	useEffect(() => {
		const el = scrollRef.current;
		const content = contentRef.current;
		if (!el || !content || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			if (pinnedRef.current) el.scrollTop = el.scrollHeight;
		});
		observer.observe(content);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	/**
	 * When the reader last did something that scrolls — a wheel, a finger, a
	 * key, the scrollbar. Only a scroll that follows one of those may unpin:
	 * the browser also scrolls on its own, clamping `scrollTop` when the
	 * content briefly shrinks (a stave clearing and redrawing its SVG makes
	 * the first turn shorter than the panel for one layout), and that is not
	 * the reader leaving the tail. Such a scroll is undone instead — nothing
	 * else will, since the content's final height is what it was.
	 */
	const userScrollAtRef = useRef(0);
	const noteUserScroll = useCallback(() => {
		userScrollAtRef.current = performance.now();
	}, []);
	const onScroll = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		const atTail = el.scrollHeight - el.clientHeight - el.scrollTop <= TAIL_SLACK_PX;
		if (atTail) pinnedRef.current = true;
		else if (performance.now() - userScrollAtRef.current < USER_SCROLL_WINDOW_MS) pinnedRef.current = false;
		else if (pinnedRef.current) el.scrollTop = el.scrollHeight;
	}, []);

	// Opening the panel puts the cursor in the composer — on a keyboard device.
	// On a phone, focus raises the software keyboard over half the screen and
	// the panel underneath it: the player opened the assistant to read, and
	// taps the field when they mean to type.
	useEffect(() => {
		if (hasCoarsePointer()) return;
		inputRef.current?.focus();
	}, []);

	function submit(text: string) {
		if (pending) return;
		// Nothing typed: the example on show is taken into the composer rather
		// than sent — what Tab does on a keyboard, on the one control a phone has.
		// The player reads it as theirs, and sends it, or edits it, themselves.
		if (text.trim() === "") {
			if (hint !== "") takeHint();
			return;
		}
		recallRef.current = null;
		setDraft("");
		void send(text);
	}

	/** The example sentence on show, into the field, caret at its end. */
	function takeHint() {
		setDraft(hint);
		requestAnimationFrame(() => {
			const field = inputRef.current;
			if (!field) return;
			field.focus();
			field.setSelectionRange(field.value.length, field.value.length);
		});
	}

	/** The player's message this reply answered — what a picked sentence is a pick for. */
	function askedBefore(replyId: string): string | null {
		const at = messages.findIndex((m) => m.id === replyId);
		for (let i = at - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].text;
		return null;
	}

	/**
	 * A suggested sentence goes into the composer, not out as a message: the
	 * blanks are the player's to fill. The first blank is selected, so typing
	 * replaces it; a sentence with none is ready to send.
	 */
	function take(template: string, asked: string | null) {
		if (asked !== null) recordPick(asked, template);
		recallRef.current = null;
		setDraft(template);
		requestAnimationFrame(() => {
			const field = inputRef.current;
			if (!field) return;
			field.focus();
			const at = template.indexOf(BLANK);
			if (at === -1) field.setSelectionRange(template.length, template.length);
			else field.setSelectionRange(at, at + BLANK.length);
		});
	}

	const status = statusLine({
		mode,
		signedIn: user !== null,
		guestQuota,
		askedForGeneral,
		nudgeTo: nudge ? nudgeTo : null,
		bookContext,
	});
	const signIn = () => router.push(`/auth?redirect=${encodeURIComponent(pathname ?? "/")}`);

	if (view === "chats") {
		return (
			<div className="as-panel" style={{ "--as-h": `${height}px` } as React.CSSProperties}>
				<ChatLibrary
					userId={user?.id ?? null}
					pathname={pathname}
					currentId={savedChatId}
					busy={pending}
					onOpen={async (id) => {
						const opened = await openChat(id);
						if (opened) onView("thread");
						return opened;
					}}
					onDeleted={forgetChat}
					onBack={() => onView("thread")}
				/>
			</div>
		);
	}

	return (
		<div className="as-panel" style={{ "--as-h": `${height}px` } as React.CSSProperties}>
			{/* Which assistant the thread talks to. The player's to set; the page
			    only proposes, once per page, when the two disagree. */}
			<div className="as-modes">
				<Segmented
					label="Which assistant"
					full
					dense
					value={mode}
					disabled={pending}
					onChange={(next) => {
						// A locked General says why in the status line rather than refusing silently.
						if (next === "general" && guestUsedUp) setAskedForGeneral(true);
						else {
							setAskedForGeneral(false);
							setMode(next);
						}
					}}
					options={modes.map((m) => {
						const Icon = MODE_ICON[m];
						const locked = m === "general" && guestUsedUp;
						return {
							value: m,
							label: (
								<>
									<Icon className="as-mode-icon" aria-hidden="true" />
									{MODE_LABEL[m]}
									{locked && <Lock className="as-lock" aria-label="locked" />}
								</>
							),
						};
					})}
				/>
			</div>

			<div className="as-status" aria-live="polite">
				{status.kind === "locked" ? (
					<>
						<Lock aria-hidden="true" />
						<span className="as-status-text">Today&apos;s free General turns are used ·</span>
						<button type="button" className="as-link" onClick={signIn}>
							Sign in to keep going
						</button>
					</>
				) : status.kind === "nudge" ? (
					<>
						<ArrowRightLeft aria-hidden="true" />
						<button type="button" className="as-link as-status-text" onClick={() => setMode(status.to)}>
							{status.to === "book" ? "Ask the open chapter" : `Switch to ${MODE_LABEL[status.to]} for this page`}
						</button>
						<button type="button" className="as-x" aria-label="Keep this mode" onClick={dismissNudge}>
							<X aria-hidden="true" />
						</button>
					</>
				) : status.kind === "quota" ? (
					<>
						<span className="as-picks" aria-hidden="true">
							{/* a pick for each turn left, an outline for each one spent */}
							{Array.from({ length: status.limit }, (_, i) => (
								<Pick key={i} className={i < status.left ? undefined : "as-pip-used"} />
							))}
						</span>
						<span className="as-status-text">
							<b>
								{status.left} of {status.limit}
							</b>{" "}
							free today ·{" "}
						</span>
						<button type="button" className="as-link" onClick={signIn}>
							Sign in for more
						</button>
					</>
				) : status.kind === "book" ? (
					<>
						<BookOpen aria-hidden="true" />
						<span className="as-status-text" title={`${status.title} · ${status.chapter}`}>
							Book · <b>{status.chapter}</b>
						</span>
					</>
				) : status.kind === "model" ? (
					<>
						<Sparkles aria-hidden="true" />
						<span className="as-status-text">Asks a model · a reply takes a moment</span>
					</>
				) : (
					<>
						<Zap aria-hidden="true" />
						<span className="as-status-text">Reads instantly, offline</span>
					</>
				)}
			</div>

			<div
				ref={scrollRef}
				onScroll={onScroll}
				onWheel={noteUserScroll}
				onTouchMove={noteUserScroll}
				onPointerDown={noteUserScroll}
				onKeyDown={noteUserScroll}
				className="as-log"
				role="log"
				aria-live="polite"
				aria-label="Assistant conversation"
			>
				<div ref={contentRef}>
					{messages.length === 0 ? (
						// Keyed on the conversation: a new chat remounts the intro and plays
						// it again from the top, and reopening the panel does not.
						<Intro
							key={sessionId}
							hello={hello}
							aside={aside}
							domain={mode}
							greeted={greeted}
							onGreeted={markGreeted}
							onExample={submit}
							onTick={followTail}
						/>
					) : (
						<ul className="as-thread">
							{messages.map((message) => {
								if (message.role === "user") {
									return (
										<li key={message.id} className="as-you">
											{message.text}
										</li>
									);
								}
								const lang = message.lang ?? "en";
								// Everything but the words waits until they have been said.
								const said = message.streamed === true;
								const answers =
									said && (message.templates || message.readAs || (message.askGeneral && !guestUsedUp));
								const credits = said && (message.model || (message.book && !message.failed));
								return (
									<li key={message.id} className="as-reply" data-m={replyModule(message)}>
										<div className="as-row">
											<Who />
											{/* One group: the words, then the card they introduce as its
											    last piece — full width, where a grid actually fits. */}
											<div className="as-stack">
												<div className="as-bub" data-muted={message.failed ? "" : undefined}>
													<StreamedText
														text={message.text}
														markdown={Boolean(message.model)}
														animate={!said}
														onTick={followTail}
														onDone={() => markStreamed(message.id)}
													/>
												</div>
												{said && message.proposal && <ProposalPreview proposal={message.proposal} />}
												{said && message.chords && <ChordShapeCard chords={message.chords} lang={lang} />}
												{said && message.tabProposal && <TabProposalPreview proposal={message.tabProposal} />}
												{said && message.tabEdit && (
													<TabEditCard
														edit={message.tabEdit}
														done={message.editDone === true}
														onDone={() => markEditDone(message.id)}
														lang={lang}
													/>
												)}
												{said && message.edit && (
													<EditIntentCard
														edit={message.edit}
														patterns={patterns}
														index={index}
														ensureIndex={ensureIndex}
														done={message.editDone === true}
														onDone={() => markEditDone(message.id)}
														lang={lang}
													/>
												)}
											</div>
										</div>

										{(answers || credits) && (
											<div className="as-after">
												{said && message.templates && (
													<Options>
														{message.templates.map((template, i) => (
															<Option
																key={template}
																order={i}
																tone="template"
																onClick={() => take(template, askedBefore(message.id))}
															>
																{template}
															</Option>
														))}
													</Options>
												)}
												{said && (message.readAs || (message.askGeneral && !guestUsedUp)) && (
													<Options>
														{message.readAs && (
															<Option
																order={message.templates?.length ?? 0}
																tone="outline"
																onClick={() => void readAs(message.id, message.readAs!.domain, message.readAs!.text)}
																icon={<ArrowRightLeft aria-hidden="true" />}
															>
																{pick(lang, `Read as ${MODE_LABEL[message.readAs.domain]} instead`, `按${MODE_LABEL_ZH[message.readAs.domain]}读`)}
															</Option>
														)}
														{/* The rules read nothing; the model may. Same sentence, same
														    thread, answered again by General — hidden from a guest
														    whose free turns are gone, as the chip's segment is locked. */}
														{message.askGeneral && !guestUsedUp && (
															<Option
																order={(message.templates?.length ?? 0) + (message.readAs ? 1 : 0)}
																tone="outline"
																onClick={() => void readAs(message.id, "general", message.askGeneral!.text)}
																icon={<Sparkles aria-hidden="true" />}
															>
																{pick(lang, "Ask General instead", "改问 General")}
															</Option>
														)}
													</Options>
												)}
												{/* Who wrote it. A rules reply says nothing; a model's says which
												    model, so the player knows when to weigh the words. */}
												{said && message.model && (
													<span className="as-byline">
														<Sparkles aria-hidden="true" />
														{pick(lang, `Answered by ${modelDisplayName(message.model)}`, `由 ${modelDisplayName(message.model)} 回答`)}
													</span>
												)}
												{/* Where a chapter answer came from (#203): the pages it cites,
												    each a way to the page beside the book — or a plain word that
												    it is not the book's. */}
												{said && message.book && !message.failed && (
													<span className="as-byline">
														{message.book.source === "book" ? (
															<>
																<BookOpen aria-hidden="true" />
																{message.book.pages.length > 0
																	? pick(lang, "From the book:", "出自书中：")
																	: pick(lang, "From the book", "出自书中")}
																{message.book.pages.map((page) => (
																	<button
																		key={page}
																		type="button"
																		onClick={() => openPage(message.book!, page)}
																		title={pick(lang, "See this page of the book", "看书的这一页")}
																		className="as-page"
																	>
																		p.{page}
																		<ArrowUpRight aria-hidden="true" />
																	</button>
																))}
															</>
														) : (
															pick(lang, "Not from this book", "不是出自这本书")
														)}
													</span>
												)}
											</div>
										)}
									</li>
								);
							})}
						</ul>
					)}

					{pending && (
						<div style={{ marginTop: 14 }}>
							<TypingBubble mode={mode} />
						</div>
					)}

					{/* Once the model has answered, the thread can be kept — never without asking. */}
					{hasModelReply(messages) && !savedLineHidden && (
						<SaveLine
							signedIn={user !== null}
							saved={savedChatId !== null}
							state={saveState}
							pathname={pathname}
							onSave={() => user && void saveChat(user.id)}
							onOpenLibrary={() => onView("chats")}
							onHide={hideSavedLine}
						/>
					)}
				</div>
			</div>

			<form
				className="as-composer"
				onSubmit={(e) => {
					e.preventDefault();
					submit(draft);
				}}
			>
				<div className="as-field">
					<textarea
						ref={inputRef}
						rows={1}
						value={draft}
						onChange={(e) => {
							// Typing turns a recalled message into a draft of its own — and
							// answers the prompt to switch: the mode on the chip is the one meant.
							recallRef.current = null;
							if (nudge && e.target.value !== "") dismissNudge();
							setDraft(e.target.value);
						}}
						onKeyDown={(e) => {
							if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.altKey && !e.metaKey) {
								if (recall(e.key === "ArrowUp" ? -1 : 1)) e.preventDefault();
								return;
							}
							if (e.key === "Tab" && !e.shiftKey && hint !== "") {
								e.preventDefault();
								// And kept from the popover: with the send button disabled on an
								// empty field, this textarea is the last thing a focus trap can
								// tab to, so the trap loops focus back to the top itself — a move
								// preventDefault cannot undo, because it is not the browser's.
								e.stopPropagation();
								takeHint();
								return;
							}
							// Enter sends, as everywhere else a message is typed; the line
							// break is the shifted one.
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								submit(draft);
							}
						}}
						maxLength={MAX_INPUT_CHARS}
						placeholder={hint || (mode === "book" ? "Ask the open chapter" : mode === "tab" ? "A chord and the strings to pick, or a tab" : mode === "general" ? "Ask anything, or say what you want made" : "Chords, a rhythm, or what you want")}
						aria-label={mode === "book" ? "Ask the open chapter" : mode === "tab" ? "Ask the tab assistant" : mode === "general" ? "Ask the assistant" : "Ask the strum assistant"}
						aria-describedby={hint ? `${promptHintId}` : undefined}
						className="as-input"
					/>
					<span id={promptHintId} className="sr-only">
						Press Tab to use the example shown, Shift and Enter for a new line, Up and Down
						for messages you have sent.
					</span>
					{/* While a reply is on its way, the same place stops it. */}
					{pending ? (
						<Button type="button" size="sm" aria-label="Stop the reply" title="Stop" onClick={stop} className="as-send">
							<Square aria-hidden="true" className="as-stop" />
						</Button>
					) : (
						<Button
							type="submit"
							size="sm"
							// Live on an empty field while there is an example to take.
							disabled={draft.trim() === "" && hint === ""}
							aria-label={draft.trim() === "" && hint !== "" ? "Use the example shown" : "Send"}
							className="as-send"
						>
							<ArrowUp aria-hidden="true" />
						</Button>
					)}
				</div>
				<div className="as-hint" aria-hidden="true">
					<span className="as-kbd">Tab</span> takes the example · <span className="as-kbd">↑</span> what you sent
				</div>
			</form>
		</div>
	);
}
