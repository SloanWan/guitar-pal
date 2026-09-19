"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, Loader2, MessageCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { exportMisses, readMisses } from "@/lib/assistant/missLog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AssistantPanel from "./AssistantPanel";
import { useAssistant } from "./useAssistant";
import { HANDOFF_EVENT } from "@/lib/assistant/handoff";

/**
 * The topbar's rightmost control: opens the assistant over the page. Which
 * assistant — strum or tab — is the chip in the panel; the page only sets it.
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
/** How tall the conversation may be, in px. The panel floats over content it does not own. */
const MIN_PANEL_HEIGHT = 240;
const MAX_PANEL_HEIGHT = 720;
const DEFAULT_PANEL_HEIGHT = 480;
const HEIGHT_KEY = "guitarpal:assistantHeight";

function clampHeight(px: number): number {
	// Never taller than the viewport leaves room for, whatever was remembered.
	const viewportMax = typeof window === "undefined" ? MAX_PANEL_HEIGHT : window.innerHeight * 0.8;
	return Math.round(Math.min(MAX_PANEL_HEIGHT, viewportMax, Math.max(MIN_PANEL_HEIGHT, px)));
}

function readHeight(): number {
	try {
		const raw = localStorage.getItem(HEIGHT_KEY);
		const px = raw === null ? Number.NaN : Number(raw);
		return Number.isFinite(px) ? clampHeight(px) : DEFAULT_PANEL_HEIGHT;
	} catch {
		return DEFAULT_PANEL_HEIGHT;
	}
}

/**
 * One launcher for the one assistant, mounted in the topbar and so outliving
 * every route change: the thread, and the mode it is in, carry across pages.
 */
export default function AssistantLauncher() {
	const [open, setOpen] = useState(false);

	// The conversation's height, dragged from the bottom edge and kept on this
	// device: a size someone settled on is a preference, not a session.
	// Read lazily and only on the client. Nothing that wears the height is in
	// the server's markup — the panel mounts on click — so the first render's
	// value cannot disagree with anything React hydrates against.
	const [height, setHeight] = useState(() =>
		typeof window === "undefined" ? DEFAULT_PANEL_HEIGHT : readHeight(),
	);
	const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

	function onGripPointerDown(e: React.PointerEvent<HTMLDivElement>) {
		dragRef.current = { startY: e.clientY, startHeight: height };
		e.currentTarget.setPointerCapture(e.pointerId);
	}
	function onGripPointerMove(e: React.PointerEvent<HTMLDivElement>) {
		const drag = dragRef.current;
		if (!drag) return;
		setHeight(clampHeight(drag.startHeight + (e.clientY - drag.startY)));
	}
	function onGripPointerUp(e: React.PointerEvent<HTMLDivElement>) {
		if (!dragRef.current) return;
		dragRef.current = null;
		e.currentTarget.releasePointerCapture(e.pointerId);
		try {
			localStorage.setItem(HEIGHT_KEY, String(height));
		} catch {
			// Private mode: the size holds for this session and no longer.
		}
	}
	const assistant = useAssistant();
	const { messages, pending } = assistant;

	// Development only: the sentences nothing read, one click from the eval set.
	// Counted when the panel is open, which is when anyone is looking.
	const devMisses = process.env.NODE_ENV === "development" && open ? readMisses().length : 0;
	async function copyMisses() {
		try {
			await navigator.clipboard.writeText(exportMisses());
			toast(`${devMisses} misses copied as JSON — paste into cases.ts.`);
		} catch {
			toast("Could not reach the clipboard. Run exportMisses() in the console instead.");
		}
	}

	/**
	 * How many messages the player had in front of them the last time the panel
	 * opened or closed. Anything beyond it arrived while the panel was shut — a
	 * reply that finished after they closed it — and is what the dot marks.
	 * Derived rather than flagged: no effect has to watch `pending` fall.
	 */
	const [seenCount, setSeenCount] = useState(messages.length);
	const unread = !open && messages.length > seenCount;

	function setPanelOpen(next: boolean) {
		// A conversation that went quiet while the panel was shut is over before
		// it is shown; the fresh greeting is what opens.
		if (next) assistant.expireIfIdle();
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

	const title = "Assistant";
	const label = pending
		? `${title} — still writing`
		: unread
			? `${title} — a reply is waiting`
			: `Open the ${title.toLowerCase()}`;

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
				// The page's own background, not the panel surface: a conversation
				// reads as a place of its own, and the bubbles carry the contrast.
				className="w-[min(24rem,calc(100vw-1.5rem))] bg-surface p-0 [box-shadow:var(--elev-panel)]"
			>
				<div className="flex items-center justify-between border-b border-line px-3 py-2">
					<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
						{title}
					</span>
					{devMisses > 0 && (
						<button
							type="button"
							onClick={copyMisses}
							title="Development only: copy every sentence nothing read, as eval-set JSON"
							className="mr-auto ml-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint transition-colors duration-(--dur-hover) hover:text-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
						>
							<ClipboardList className="size-3" strokeWidth={1.5} aria-hidden="true" />
							misses · {devMisses}
						</button>
					)}
					{assistant.messages.length > 0 && (
						<button
							type="button"
							onClick={assistant.reset}
							disabled={assistant.pending}
							className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors duration-(--dur-hover) hover:text-denim-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
						>
							<Plus className="size-3" strokeWidth={1.5} aria-hidden="true" />
							New chat
						</button>
					)}
				</div>
				{open && <AssistantPanel assistant={assistant} height={height} />}
				{/* The grip: the panel's bottom edge, draggable. touch-action none so a
				    finger dragging it resizes the panel rather than scrolling the page. */}
				<div
					role="separator"
					aria-orientation="horizontal"
					aria-label="Resize the assistant panel"
					aria-valuemin={MIN_PANEL_HEIGHT}
					aria-valuemax={MAX_PANEL_HEIGHT}
					aria-valuenow={height}
					tabIndex={0}
					onPointerDown={onGripPointerDown}
					onPointerMove={onGripPointerMove}
					onPointerUp={onGripPointerUp}
					onPointerCancel={onGripPointerUp}
					onKeyDown={(e) => {
						// The keyboard gets the same control, a step at a time.
						if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
						e.preventDefault();
						setHeight((h) => clampHeight(h + (e.key === "ArrowDown" ? 24 : -24)));
					}}
					className="group flex h-2.5 cursor-ns-resize touch-none items-center justify-center border-t border-line focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
				>
					<span
						aria-hidden="true"
						className="h-0.5 w-8 bg-line-strong transition-colors duration-(--dur-hover) group-hover:bg-denim"
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}
