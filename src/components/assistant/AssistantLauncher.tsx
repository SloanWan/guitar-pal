"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ClipboardList, History, Loader2, MessageCircle, Plus, X } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import { exportMisses, readMisses } from "@/lib/assistant/missLog";
import { modeModule } from "@/lib/assistant/panelView";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button, buttonClasses } from "@/components/ui/button";
import AssistantPanel from "./AssistantPanel";
import { useAssistant } from "./useAssistant";
import { ASSISTANT_ASK_EVENT, ASSISTANT_CLOSE_EVENT, HANDOFF_EVENT, type AssistantAsk } from "@/lib/assistant/handoff";
import "./assistant.css";

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
	/** What the panel shows: the thread, or the saved chats in its place. */
	const [view, setView] = useState<"thread" | "chats">("thread");

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

	// Handing a proposal over, or opening a chord's page, is the end of the
	// conversation about it: the panel stands in front of the very page the
	// card just led to. Closed the same way a click closes it, or the reply
	// just read would come back as a dot.
	useEffect(() => {
		function close() {
			setSeenCount(messages.length);
			setOpen(false);
		}
		window.addEventListener(HANDOFF_EVENT, close);
		window.addEventListener(ASSISTANT_CLOSE_EVENT, close);
		return () => {
			window.removeEventListener(HANDOFF_EVENT, close);
			window.removeEventListener(ASSISTANT_CLOSE_EVENT, close);
		};
	}, [messages.length]);

	// A page asking for the player (Home's Ask): the panel opens on the
	// conversation — never on the saved chats — and the sentence goes in, in
	// the mode chosen there.
	const askRef = useRef({ open: setPanelOpen, send: assistant.send });
	useEffect(() => {
		askRef.current = { open: setPanelOpen, send: assistant.send };
	});
	useEffect(() => {
		function ask(e: Event) {
			const { text, mode } = (e as CustomEvent<AssistantAsk>).detail;
			setView("thread");
			askRef.current.open(true);
			void askRef.current.send(text, mode);
		}
		window.addEventListener(ASSISTANT_ASK_EVENT, ask);
		return () => window.removeEventListener(ASSISTANT_ASK_EVENT, ask);
	}, []);

	const title = "Assistant";
	// every name starts with the visible word, so a voice user can say "Ask"
	const ask = `Ask the ${title.toLowerCase()}`;
	const label = pending ? `${ask} — still writing` : unread ? `${ask} — a reply is waiting` : ask;

	return (
		<Popover open={open} onOpenChange={setPanelOpen}>
			<PopoverTrigger asChild>
				{/* Ask: a secondary button, worded from 720px and an icon on a phone's app bar */}
				<Button variant="secondary" size="sm" aria-label={label} className="max-[719.98px]:aspect-square max-[719.98px]:px-0">
					{/* The icon says what the conversation is doing while the panel is
					    shut: turning while a reply is being written, and wearing a dot
					    once one has landed unseen. Plain CSS animation — this is state
					    display, not an interaction. */}
					{pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <MessageCircle aria-hidden="true" />}
					<span className="gp-wide-only">Ask</span>
					{unread && (
						<span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-gp-a2" />
					)}
				</Button>
			</PopoverTrigger>

			<PopoverContent
				align="end"
				sideOffset={8}
				collisionPadding={8}
				// Portaled out of <main>, so it carries the module itself: the mode's
				// colour for the chip's thumb and the send button. Each reply in the
				// thread re-points it to its own.
				data-m={modeModule(assistant.mode)}
				className="as-pop"
				// A field that answers Escape itself (renaming a saved chat) keeps the panel open.
				onEscapeKeyDown={(e) => {
					if (document.activeElement?.closest("[data-own-escape]")) e.preventDefault();
				}}
			>
				<div className="as-head">
					<span className="as-title">{title}</span>
					{/* What the rules readers understand, as a page. The panel closes
					    on the way there — it would stand in front of the very thing
					    the reader is trying to read. */}
					<Link
						href="/docs/assistant-grammar"
						onClick={() => setPanelOpen(false)}
						title="What the assistant reads"
						aria-label="What the assistant reads"
						className={buttonClasses("ghost", "as-icon-btn")}
						data-size="xs"
					>
						<BookOpen aria-hidden="true" />
					</Link>
					{devMisses > 0 && (
						<Button
							variant="ghost"
							size="xs"
							onClick={copyMisses}
							title="Development only: copy every sentence nothing read, as eval-set JSON"
							aria-label={`Copy ${devMisses} misses`}
							className="as-misses"
						>
							<ClipboardList aria-hidden="true" />
							{devMisses}
						</Button>
					)}
					<span className="as-spacer" />
					{/* The saved chats (#401) take the panel's place; pressed again, the thread comes back. */}
					<Button
						variant="ghost"
						size="xs"
						className="as-icon-btn"
						aria-label="Your saved chats"
						title="Your saved chats"
						aria-pressed={view === "chats"}
						onClick={() => setView(view === "chats" ? "thread" : "chats")}
					>
						<History aria-hidden="true" />
					</Button>
					{/* Always there, so the head never shifts: there is nothing to start
					    over from until something has been said. */}
					<Button
						variant="ghost"
						size="xs"
						onClick={() => {
							assistant.reset();
							setView("thread");
						}}
						disabled={assistant.messages.length === 0 || assistant.pending}
					>
						<Plus aria-hidden="true" />
						New chat
					</Button>
					<PopoverPrimitive.Close asChild>
						<Button variant="ghost" size="xs" aria-label="Close the assistant" className="as-icon-btn">
							<X aria-hidden="true" />
						</Button>
					</PopoverPrimitive.Close>
				</div>
				{open && <AssistantPanel assistant={assistant} height={height} view={view} onView={setView} />}
				{/* The grip: the panel's bottom edge, draggable. touch-action none so a
				    finger dragging it resizes the panel rather than scrolling the page.
				    A phone's panel fills the window and has none. */}
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
					className="as-grip"
				/>
			</PopoverContent>
		</Popover>
	);
}
