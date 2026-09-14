"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import ProposalPreview from "./ProposalPreview";
import EditIntentCard from "./EditIntentCard";
import { Option, Options } from "./Options";
import { BLANK } from "@/lib/strumAssistant/suggest";
import { recordPick } from "@/lib/strumAssistant/missLog";
import { prefersReducedMotion } from "@/lib/motion";
import { greeting, hint as introHint, playerName, INPUT_PROMPTS } from "@/lib/strumAssistant/greeting";
import { uiLang } from "@/lib/strumAssistant/lang";
import { useUser } from "@/hooks/useUser";
import type { useAssistant } from "./useAssistant";

/**
 * The conversation, rendered. The state is the launcher's — this only mounts
 * while the popover is open, and a conversation that ended every time the
 * popover closed would be no conversation at all.
 */

/**
 * Shown on an empty panel: chords, a rhythm, and a sentence — each one read by
 * the app, so every click lands. A lone "C" would not: one chord is a key, not
 * a progression, and the sentence reader steps aside for it.
 */
const EXAMPLES = ["C Am F G", "D DU UD", "a slow folk strum in C G Am F"];

const MAX_INPUT_CHARS = 600;
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
	animate,
	onTick,
	onDone,
}: {
	text: string;
	animate: boolean;
	onTick: () => void;
	onDone: () => void;
}) {
	const [shown, setShown] = useState(() => (animate ? 0 : text.length));
	// Held in a ref so a new callback identity cannot restart the typing.
	const callbacks = useRef({ onTick, onDone });
	useEffect(() => {
		callbacks.current = { onTick, onDone };
	});

	useEffect(() => {
		if (!animate) return;
		// Reduced motion takes the same path with one step: the message lands
		// whole, and everything waiting on the end of it still fires.
		const step = prefersReducedMotion()
			? text.length
			: Math.max(1, Math.ceil(text.length / (REVEAL_MS / TICK_MS)));
		let revealed = 0;
		const timer = setInterval(() => {
			revealed = Math.min(text.length, revealed + step);
			setShown(revealed);
			callbacks.current.onTick();
			if (revealed >= text.length) {
				clearInterval(timer);
				callbacks.current.onDone();
			}
		}, TICK_MS);
		return () => clearInterval(timer);
	}, [animate, text]);

	return <>{text.slice(0, shown)}</>;
}

/**
 * The tail, as a shape rather than a block.
 *
 * A square stepped off the corner read as a stray pixel; this is the curved
 * fin a chat bubble actually has. Its straight edge is the bubble's own edge,
 * so the two abut exactly — which matters more than it sounds, because the
 * assistant's fill is translucent and any overlap would show as a darker seam.
 */
function Tail({ side }: { side: "user" | "assistant" }) {
	const isUser = side === "user";
	return (
		<svg
			aria-hidden="true"
			width="8"
			height="10"
			viewBox="0 0 8 10"
			className={`absolute bottom-0 ${isUser ? "-right-2" : "-left-2 -scale-x-100"}`}
			style={{ fill: isUser ? "var(--denim)" : "var(--denim-tint)" }}
		>
			<path d="M0 0C0 5.5 1.8 8.6 8 10H0Z" />
		</svg>
	);
}

/**
 * One turn, as a bubble.
 *
 * The shape a chat wants — sides, fills, a tail — in this system's vocabulary
 * rather than iMessage's: square corners and a flat fill instead of a rounded
 * capsule and a shadow, with the tail the one curve in it.
 */
function Bubble({
	side,
	muted,
	children,
}: {
	side: "user" | "assistant";
	/** A turn that failed — read as an aside, not as the assistant speaking. */
	muted?: boolean;
	children: React.ReactNode;
}) {
	const isUser = side === "user";
	return (
		<div
			className={`relative max-w-[85%] whitespace-pre-line px-2.5 py-1.5 text-sm leading-snug ${
				isUser
					? "bg-denim text-on-denim"
					: `bg-denim-tint ${muted ? "text-ink-dim italic" : "text-ink"}`
			}`}
		>
			{children}
			<Tail side={side} />
		</div>
	);
}

/** The assistant, mid-sentence. */
function TypingBubble() {
	return (
		<Bubble side="assistant">
			<span className="flex items-center gap-1 py-0.5" aria-label="Writing a reply">
				{[0, 0.15, 0.3].map((delay) => (
					<span
						key={delay}
						aria-hidden="true"
						className="size-[5px] bg-ink-dim animate-[typing-tick_1.05s_ease-in-out_infinite] motion-reduce:animate-none"
						style={{ animationDelay: `${delay}s` }}
					/>
				))}
			</span>
		</Bubble>
	);
}

/** How long the assistant appears to think before it says hello. */
const INTRO_TYPING_MS = 1400;

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
	greeted,
	onGreeted,
	onExample,
	onTick,
}: {
	hello: string;
	/** The line after the greeting: what this does, and for a guest, where their work lives. */
	aside: string;
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

	return (
		<div className="flex flex-col items-start gap-2.5">
			{phase === 0 && <TypingBubble />}

			{phase >= 1 && (
				<Bubble side="assistant">
					<StreamedText text={hello} animate={phase === 1} onTick={onTick} onDone={() => setPhase(2)} />
				</Bubble>
			)}

			{phase >= 2 && (
				<Bubble side="assistant">
					<StreamedText
						text={aside}
						animate={phase === 2}
						onTick={onTick}
						onDone={() => {
							setPhase(3);
							onGreeted();
						}}
					/>
				</Bubble>
			)}

			{phase === 3 && (
				<div className="flex flex-wrap gap-1.5 pl-2">
					{EXAMPLES.map((example, i) => (
						<button
							key={example}
							type="button"
							onClick={() => onExample(example)}
							// Each one lands a beat after the last. backwards fill keeps
							// it invisible until its own animation starts.
							className="border border-line-strong px-2 py-1 font-mono text-[11px] tracking-[0.04em] text-ink-dim transition-[color,border-color] duration-(--dur-hover) ease-out hover:border-denim hover:text-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 animate-[proposal-pop_0.35s_ease-out_backwards] motion-reduce:animate-none"
							style={{ animationDelay: `${i * 0.14}s` }}
						>
							{example}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export default function AssistantPanel({
	assistant,
	height,
}: {
	assistant: ReturnType<typeof useAssistant>;
	/** Set by the launcher's grip; the panel only wears it. */
	height: number;
}) {
	const {
		messages,
		pending,
		send,
		markStreamed,
		markEditDone,
		patterns,
		index,
		ensureIndex,
		sessionId,
		greeted,
		markGreeted,
	} = assistant;
	const [draft, setDraft] = useState("");
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const promptHintId = useId();
	const { user } = useUser();

	// Picked once per conversation rather than per render: a line that changed
	// while being read would be a tic, not a greeting.
	// The greeting speaks the interface's language — nothing has been said yet
	// to follow — and to a guest it never uses a name, having none to use.
	const lang = uiLang();
	const name = user ? playerName(user.user_metadata, user.email) : null;
	const hello = useMemo(() => greeting(name, sessionId, lang), [name, sessionId, lang]);
	const aside = introHint(lang, user !== null);

	// The examples take turns while there is nothing typed. Tab takes the one on
	// screen — only while the field is empty, so Tab still leaves a field with
	// something in it, and Shift+Tab always walks back the way it should.
	const [promptSlot, setPromptSlot] = useState(0);
	const hint = draft === "" ? INPUT_PROMPTS[promptSlot % INPUT_PROMPTS.length] : "";
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
	}, []);

	useEffect(followTail, [messages, pending, followTail]);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	function submit(text: string) {
		if (pending) return;
		recallRef.current = null;
		setDraft("");
		void send(text);
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

	return (
		<div className="flex flex-col" style={{ height }}>
			<div
				ref={scrollRef}
				className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
				role="log"
				aria-live="polite"
				aria-label="Assistant conversation"
			>
				{messages.length === 0 ? (
					// Keyed on the conversation: a new chat remounts the intro and plays
					// it again from the top, and reopening the panel does not.
					<Intro
						key={sessionId}
						hello={hello}
						aside={aside}
						greeted={greeted}
						onGreeted={markGreeted}
						onExample={submit}
						onTick={followTail}
					/>
				) : (
					<ul className="space-y-2.5">
						{messages.map((message) =>
							message.role === "user" ? (
								<li key={message.id} className="flex justify-end">
									<Bubble side="user">{message.text}</Bubble>
								</li>
							) : (
								<li key={message.id} className="flex flex-col items-start gap-2">
									<Bubble side="assistant" muted={message.failed}>
										<StreamedText
											text={message.text}
											animate={message.streamed !== true}
											onTick={followTail}
											onDone={() => markStreamed(message.id)}
										/>
									</Bubble>
									{/* The preview is an attachment, not speech: full width under
									    the bubble, where a 16-cell grid actually fits — and held
									    back until the message has finished saying what it is. */}
									{message.proposal && message.streamed === true && (
										<div className="w-full">
											<ProposalPreview proposal={message.proposal} />
										</div>
									)}
									{message.templates && message.streamed === true && (
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
									{message.edit && message.streamed === true && (
										<div className="w-full">
											<EditIntentCard
												edit={message.edit}
												patterns={patterns}
												index={index}
												ensureIndex={ensureIndex}
												done={message.editDone === true}
												onDone={() => markEditDone(message.id)}
												lang={message.lang ?? "en"}
											/>
										</div>
									)}
								</li>
							),
						)}
					</ul>
				)}

				{pending && (
					<div className="mt-2.5 flex justify-start">
						<TypingBubble />
					</div>
				)}
			</div>

			<form
				className="flex flex-none items-end gap-2 border-t border-line p-2"
				onSubmit={(e) => {
					e.preventDefault();
					submit(draft);
				}}
			>
				<textarea
					ref={inputRef}
					rows={1}
					value={draft}
					onChange={(e) => {
						// Typing turns a recalled message into a draft of its own.
						recallRef.current = null;
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
							setDraft(hint);
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
					placeholder={hint || "Chords, a rhythm, or what you want"}
					aria-label="Ask the strum assistant"
					aria-describedby={hint ? `${promptHintId}` : undefined}
					className="min-w-0 flex-1 resize-none overflow-y-auto border border-line-strong bg-panel px-2 py-[0.4375rem] text-sm leading-snug text-ink placeholder:text-ink-faint focus-visible:border-denim focus-visible:outline-none"
				/>
				<span id={promptHintId} className="sr-only">
					Press Tab to use the example shown, Shift and Enter for a new line, Up and Down
					for messages you have sent.
				</span>
				<button
					type="submit"
					disabled={pending || draft.trim() === ""}
					aria-label="Send"
					className="flex size-(--h-control) flex-none items-center justify-center border border-line-strong text-ink-dim transition-[color,background-color,border-color] duration-(--dur-hover) ease-out hover:border-denim hover:text-denim-accent active:bg-denim-tint active:duration-(--dur-switch) disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
				>
					<CornerDownLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
				</button>
			</form>
		</div>
	);
}
