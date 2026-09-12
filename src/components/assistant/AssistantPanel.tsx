"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Loader2 } from "lucide-react";
import ProposalPreview from "./ProposalPreview";
import type { useAssistant } from "./useAssistant";

/**
 * The conversation, rendered. The state is the launcher's — this only mounts
 * while the popover is open, and a conversation that ended every time the
 * popover closed would be no conversation at all.
 */

/** Shown on an empty panel: the two deterministic shapes, then a model one. */
const EXAMPLES = ["C Am F G", "D DU UD", "a slow folk strum in C"];

const MAX_INPUT_CHARS = 600;

export default function AssistantPanel({ assistant }: { assistant: ReturnType<typeof useAssistant> }) {
	const { messages, pending, send } = assistant;
	const [draft, setDraft] = useState("");
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	// Follow the conversation as it grows, so the newest turn is the one on screen.
	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages, pending]);

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
					<ul className="space-y-3">
						{messages.map((message) => (
							<li key={message.id}>
								{message.role === "user" ? (
									<p className="ml-6 border-l-2 border-denim pl-2 text-sm leading-snug text-ink">
										{message.text}
									</p>
								) : (
									<div>
										<p
											className={`text-sm leading-snug ${
												message.failed ? "text-ink-dim italic" : "text-ink"
											}`}
										>
											{message.text}
										</p>
										{message.proposal && <ProposalPreview proposal={message.proposal} />}
									</div>
								)}
							</li>
						))}
					</ul>
				)}

				{pending && (
					<p className="mt-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
						<Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
						Thinking
					</p>
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
					className="h-(--h-control) min-w-0 flex-1 border border-line-strong bg-surface px-2 text-sm text-ink placeholder:text-ink-faint focus-visible:border-denim focus-visible:outline-none"
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
