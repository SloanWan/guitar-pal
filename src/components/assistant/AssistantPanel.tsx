"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import ProposalPreview from "./ProposalPreview";
import { prefersReducedMotion } from "@/lib/motion";
import type { useAssistant } from "./useAssistant";

/**
 * The conversation, rendered. The state is the launcher's — this only mounts
 * while the popover is open, and a conversation that ended every time the
 * popover closed would be no conversation at all.
 */

/** Shown on an empty panel: the two deterministic shapes, then a model one. */
const EXAMPLES = ["C Am F G", "D DU UD", "a slow folk strum in C"];

const MAX_INPUT_CHARS = 600;

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
			className={`relative max-w-[85%] px-2.5 py-1.5 text-sm leading-snug ${
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

export default function AssistantPanel({ assistant }: { assistant: ReturnType<typeof useAssistant> }) {
	const { messages, pending, send, markStreamed } = assistant;
	const [draft, setDraft] = useState("");
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

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
		setDraft("");
		void send(text);
	}

	return (
		<div className="flex h-[min(30rem,70vh)] flex-col">
			<div
				ref={scrollRef}
				className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
				role="log"
				aria-live="polite"
				aria-label="Assistant conversation"
			>
				{messages.length === 0 ? (
					<div className="space-y-3">
						<p className="text-xs leading-relaxed text-ink-dim">
							Type chords or a rhythm and it is read instantly, offline. Describe what you
							want in words and it asks the model.
						</p>
						<div className="flex flex-wrap gap-1.5">
							{EXAMPLES.map((example) => (
								<button
									key={example}
									type="button"
									onClick={() => submit(example)}
									className="border border-line-strong px-2 py-1 font-mono text-[11px] tracking-[0.04em] text-ink-dim transition-[color,border-color] duration-(--dur-hover) ease-out hover:border-denim hover:text-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
								>
									{example}
								</button>
							))}
						</div>
					</div>
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
								</li>
							),
						)}
					</ul>
				)}

				{pending && (
					<div className="mt-2.5 flex justify-start">
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
					</div>
				)}
			</div>

			<form
				className="flex flex-none items-center gap-2 border-t border-line p-2"
				onSubmit={(e) => {
					e.preventDefault();
					submit(draft);
				}}
			>
				<input
					ref={inputRef}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					maxLength={MAX_INPUT_CHARS}
					placeholder="Chords, a rhythm, or what you want"
					aria-label="Ask the strum assistant"
					className="h-(--h-control) min-w-0 flex-1 border border-line-strong bg-panel px-2 text-sm text-ink placeholder:text-ink-faint focus-visible:border-denim focus-visible:outline-none"
				/>
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
