"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AssistantPanel from "./AssistantPanel";
import { useAssistant } from "./useAssistant";
import { HANDOFF_EVENT } from "@/lib/strumAssistant/handoff";

/**
 * The topbar's rightmost control: opens the strum assistant over the page.
 *
 * A popover anchored to the topbar rather than a draggable window — dragging
 * buys nothing here and costs mobile layout, focus management and a z-index to
 * maintain. The panel is non-modal so the pattern underneath stays visible and
 * readable while the conversation happens.
 *
 * The panel mounts only while open, so a session that never asks anything never
 * fetches the chord index. The conversation itself lives here, not in the
 * panel: closing the popover is putting the assistant away, not ending the
 * talk, and a reply that was in flight when it closed still lands.
 */
export default function AssistantLauncher() {
	const [open, setOpen] = useState(false);
	const assistant = useAssistant();
	const { messages, pending } = assistant;

	/**
	 * How many messages the player had in front of them the last time the panel
	 * opened or closed. Anything beyond it arrived while the panel was shut — a
	 * reply that finished after they closed it — and is what the dot marks.
	 * Derived rather than flagged: no effect has to watch `pending` fall.
	 */
	const [seenCount, setSeenCount] = useState(messages.length);
	const unread = !open && messages.length > seenCount;

	function setPanelOpen(next: boolean) {
		// Both transitions mark everything so far as seen: opening shows it,
		// closing means it was on screen until now.
		setSeenCount(messages.length);
		setOpen(next);
	}

	// Handing a proposal over is the end of the conversation about it: the panel
	// stands in front of the very grid the pattern just landed in. Closed the
	// same way a click closes it, or the reply just read would come back as a dot.
	useEffect(() => {
		function close() {
			setSeenCount(messages.length);
			setOpen(false);
		}
		window.addEventListener(HANDOFF_EVENT, close);
		return () => window.removeEventListener(HANDOFF_EVENT, close);
	}, [messages.length]);

	const label = pending
		? "Strum assistant — still writing"
		: unread
			? "Strum assistant — a reply is waiting"
			: "Open the strum assistant";

	return (
		<Popover open={open} onOpenChange={setPanelOpen}>
			<PopoverTrigger
				aria-label={label}
				className="relative flex size-(--h-control) items-center justify-center border border-line-strong text-ink-dim transition-[color,background-color,border-color] duration-(--dur-hover) ease-out hover:border-denim hover:text-denim-accent active:border-denim active:bg-denim-tint active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 data-[state=open]:border-denim data-[state=open]:text-denim-accent"
			>
				{/* The icon says what the conversation is doing while the panel is
				    shut: turning while a reply is being written, and wearing a dot
				    once one has landed unseen. Plain CSS animation — this is state
				    display, not an interaction. */}
				{pending ? (
					<Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
				) : (
					<MessageCircle
						className="size-4"
						strokeWidth={1.5}
						strokeLinecap="square"
						aria-hidden="true"
					/>
				)}
				{unread && (
					<span
						aria-hidden="true"
						className="absolute right-1 top-1 size-1.5 rounded-full bg-denim"
					/>
				)}
			</PopoverTrigger>

			<PopoverContent
				align="end"
				sideOffset={8}
				collisionPadding={12}
				// The system's one elevation shadow: this panel floats over content it
				// does not own, where a 1px border alone can disappear into a busy
				// background. See --elev-panel in globals.css.
				className="w-[min(24rem,calc(100vw-1.5rem))] bg-panel p-0 [box-shadow:var(--elev-panel)]"
			>
				<div className="flex items-center justify-between border-b border-line px-3 py-2">
					<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
						Strum assistant
					</span>
					{assistant.messages.length > 0 && (
						<button
							type="button"
							onClick={assistant.reset}
							disabled={assistant.pending}
							className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors duration-(--dur-hover) hover:text-denim-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
						>
							New chat
						</button>
					)}
				</div>
				{open && <AssistantPanel assistant={assistant} />}
			</PopoverContent>
		</Popover>
	);
}
