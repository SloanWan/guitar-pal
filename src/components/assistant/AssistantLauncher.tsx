"use client";

import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BookOpen, ClipboardList, History, Loader2, MessageCircle, Plus, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import { exportMisses, readMisses } from "@/lib/assistant/missLog";
import { modeModule } from "@/lib/assistant/panelView";
import { fitPanelHeight } from "@/lib/assistant/keyboardViewport";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button, buttonClasses } from "@/components/ui/button";
import { useAssistant } from "./useAssistant";
import { useKeyboardViewport } from "./useKeyboardViewport";
import { ASSISTANT_ASK_EVENT, ASSISTANT_CLOSE_EVENT, HANDOFF_EVENT, opensOnly, type AssistantAsk } from "@/lib/assistant/handoff";
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
 * On a phone it is a full-screen dialog instead, the page locked behind it, as
 * every chat widget is on a phone (#528): a popover there is the window less a
 * margin anyway, and the keyboard takes half of what is left. Either way the
 * panel fits what the keyboard leaves and the page never moves for it.
 *
 * The panel mounts only while open, so a session that never asks anything never
 * fetches the chord index. The conversation itself lives here, not in the
 * panel: closing the popover is putting the assistant away, not ending the
 * talk, and a reply that was in flight when it closed still lands.
 */
/**
 * The panel's code is fetched when it is wanted, not with every page (#445):
 * its tab cards draw staves, and VexFlow alone is most of a page's first load
 * on pages that never draw one. A hover, focus or press on Ask starts the
 * fetch, so by the click it is usually in; `import()` fetches once.
 */
const loadPanel = () => import("./AssistantPanel");
const AssistantPanel = lazy(loadPanel);

/** How tall the conversation may be, in px. The panel floats over content it does not own. */
const MIN_PANEL_HEIGHT = 240;
const MAX_PANEL_HEIGHT = 720;
const DEFAULT_PANEL_HEIGHT = 480;
const HEIGHT_KEY = "guitarpal:assistantHeight";
/** The popover's head over the conversation and the grip under it, as assistant.css sets them. */
const HEAD_PX = 52;
const GRIP_PX = 12;
/** The gap kept between the popover and the keyboard, its collision padding. */
const EDGE_PX = 8;
/** However little the keyboard leaves, the conversation keeps its controls and a line or two. */
const MIN_FIT_HEIGHT = 160;

/**
 * Where the panel takes the whole screen: a phone, upright or — too short for a
 * popover over a keyboard — on its side.
 */
const FULL_SCREEN_QUERY = "(max-width: 719.98px), (pointer: coarse) and (max-height: 499.98px)";

function subscribeFullScreen(onChange: () => void): () => void {
	if (!window.matchMedia) return () => {};
	const mq = window.matchMedia(FULL_SCREEN_QUERY);
	mq.addEventListener("change", onChange);
	return () => mq.removeEventListener("change", onChange);
}

/** Whether the panel is the full-screen dialog; the server renders the popover's trigger, which is the same button. */
function useFullScreen(): boolean {
	return useSyncExternalStore(
		subscribeFullScreen,
		() => !!window.matchMedia && window.matchMedia(FULL_SCREEN_QUERY).matches,
		() => false,
	);
}

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

	const full = useFullScreen();
	// The panel's box, for the keyboard to be measured against while it is open.
	const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
	const viewport = useKeyboardViewport(open ? panelEl : null);
	const keyboard = viewport !== null && viewport.keyboard;
	// With a keyboard up the popover wears its height shorter, so the composer
	// sits on the keyboard rather than under it; the dragged height is kept.
	const worn =
		keyboard && !full
			? fitPanelHeight({
					wanted: height,
					top: viewport.restTop + HEAD_PX,
					visibleHeight: viewport.height,
					below: GRIP_PX + EDGE_PX,
					min: MIN_FIT_HEIGHT,
				})
			: height;

	function onGripPointerDown(e: React.PointerEvent<HTMLDivElement>) {
		dragRef.current = { startY: e.clientY, startHeight: worn };
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
	// the mode chosen there. Without a sentence (a book chapter's Ask, #406)
	// the panel opens in that mode for the player to type.
	const askRef = useRef({ open: setPanelOpen, send: assistant.send, setMode: assistant.setMode });
	useEffect(() => {
		askRef.current = { open: setPanelOpen, send: assistant.send, setMode: assistant.setMode };
	});
	useEffect(() => {
		function ask(e: Event) {
			const detail = (e as CustomEvent<AssistantAsk>).detail;
			setView("thread");
			if (opensOnly(detail)) askRef.current.setMode(detail.mode);
			askRef.current.open(true);
			if (!opensOnly(detail)) void askRef.current.send(detail.text, detail.mode);
		}
		window.addEventListener(ASSISTANT_ASK_EVENT, ask);
		return () => window.removeEventListener(ASSISTANT_ASK_EVENT, ask);
	}, []);

	const title = "Assistant";
	// every name starts with the visible word, so a voice user can say "Ask"
	const ask = `Ask the ${title.toLowerCase()}`;
	const label = pending ? `${ask} — still writing` : unread ? `${ask} — a reply is waiting` : ask;

	// One panel in either frame: the head, the conversation and, in the popover, the grip.
	const body = (
		<>
			<div className="as-head">
				{/* A dialog is named by its title; the popover by its trigger. */}
				{full ? <Dialog.Title className="as-title">{title}</Dialog.Title> : <span className="as-title">{title}</span>}
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
				<Button variant="ghost" size="xs" aria-label="Close the assistant" className="as-icon-btn" onClick={() => setPanelOpen(false)}>
					<X aria-hidden="true" />
				</Button>
			</div>
			{open && (
				// Until the code is in, the panel's own frame at its own height,
				// so nothing below it moves when the thread arrives.
				<Suspense
					fallback={
						<div className="as-panel as-panel-loading" style={{ "--as-h": `${worn}px` } as React.CSSProperties} aria-busy="true">
							<Loader2 className="animate-spin" aria-hidden="true" />
						</div>
					}
				>
					<AssistantPanel assistant={assistant} height={worn} view={view} onView={setView} />
				</Suspense>
			)}
			{/* The grip: the panel's bottom edge, draggable. touch-action none so a
			    finger dragging it resizes the panel rather than scrolling the page.
			    The full-screen panel fills the window and has none. */}
			{!full && (
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
			)}
		</>
	);
	// Portaled out of <main>, so the frame carries the module itself: the mode's
	// colour for the chip's thumb and the send button. Each reply in the thread
	// re-points it to its own.
	const panelModule = modeModule(assistant.mode);
	// A field that answers Escape itself (renaming a saved chat) keeps the panel open.
	const onEscapeKeyDown = (e: KeyboardEvent) => {
		if (document.activeElement?.closest("[data-own-escape]")) e.preventDefault();
	};

	return (
		<Popover open={open} onOpenChange={setPanelOpen}>
			<PopoverTrigger asChild>
				{/* Ask: a secondary button, worded from 720px and an icon on a phone's app bar */}
				<Button
					variant="secondary"
					size="sm"
					aria-label={label}
					className="max-[719.98px]:aspect-square max-[719.98px]:px-0"
					onPointerEnter={() => void loadPanel()}
					onPointerDown={() => void loadPanel()}
					onFocus={() => void loadPanel()}
				>
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

			{full ? (
				<Dialog.Root open={open} onOpenChange={setPanelOpen}>
					<Dialog.Portal>
						<Dialog.Content
							ref={setPanelEl}
							data-m={panelModule}
							data-keyboard={keyboard ? "" : undefined}
							className="as-pop as-full"
							aria-describedby={undefined}
							// The visible area — above the keyboard while it is up. Until the
							// first measure, the window (assistant.css).
							style={viewport ? { top: viewport.top, height: viewport.height } : undefined}
							onEscapeKeyDown={onEscapeKeyDown}
							// The dialog itself takes focus, not its first button or field: a
							// field would raise the keyboard over a panel opened to be read.
							onOpenAutoFocus={(e) => {
								e.preventDefault();
								(e.target as HTMLElement).focus();
							}}
						>
							{body}
						</Dialog.Content>
					</Dialog.Portal>
				</Dialog.Root>
			) : (
				<PopoverContent
					ref={setPanelEl}
					align="end"
					sideOffset={8}
					collisionPadding={EDGE_PX}
					data-m={panelModule}
					className="as-pop"
					// Where iOS has panned the page up for the keyboard and will not give
					// it back, the panel keeps its place on screen.
					style={keyboard && viewport.top > 0 ? { translate: `0 ${viewport.top}px` } : undefined}
					onEscapeKeyDown={onEscapeKeyDown}
				>
					{body}
				</PopoverContent>
			)}
		</Popover>
	);
}
