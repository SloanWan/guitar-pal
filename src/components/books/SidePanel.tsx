"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { prefersReducedMotion } from "@/lib/motion";
import { EYEBROW } from "@/components/books/bookUi";

/**
 * The panel beside the book (#233, #240): the right half at lg, a sheet
 * over the page below it, with a labelled header and its close. What goes
 * in it — a draft to play, a page to read — is the caller's.
 *
 * It opens and closes slowly (`--dur-panel`, globals.css): at lg the aside
 * grows from nothing to half the page and the book's column is pushed over
 * as it does; the content inside is sized to the panel's full width from
 * the start, so nothing inside re-lays out during the motion. The body is
 * mounted a frame after the aside: what goes in it can be heavy to lay out
 * (a tab's staves, an audio engine), and done at mount it would hold the
 * first paint back and skip the start of the motion. Close plays the same
 * in reverse and only then tells the owner, which unmounts it — or after
 * the animation's length, should the animation never end (a stylesheet not
 * yet there, a browser that dropped it). A panel that replaces one already
 * open (`animateOpen={false}`) skips all of that: the place is there, only
 * what is in it changes.
 */

/** `--dur-panel` (globals.css), plus slack, for the fallbacks. */
const ANIMATION_FALLBACK_MS = 700;
export default function SidePanel({
	label,
	ariaLabel,
	onClose,
	onOpened,
	animateOpen = true,
	panelRef,
	testId,
	children,
}: {
	label: string;
	/** The landmark's name when the visible label carries state ("· saved"). */
	ariaLabel?: string;
	onClose: () => void;
	/**
	 * Once the opening motion is over (or at once, without motion): where to
	 * start anything heavy that need not be there for the first frame.
	 */
	onOpened?: () => void;
	/** False when this panel takes the place of one already open: no motion, no wait. */
	animateOpen?: boolean;
	/** The element itself, for what opens inside it (the editor). */
	panelRef?: (el: HTMLElement | null) => void;
	testId?: string;
	children: React.ReactNode;
}) {
	const [closing, setClosing] = useState(false);
	// The body, one painted frame after the aside (two rAFs: the first fires
	// before that frame's paint, the second after it).
	const [bodyShown, setBodyShown] = useState(!animateOpen);
	useEffect(() => {
		if (!animateOpen) return;
		let inner = 0;
		const outer = requestAnimationFrame(() => {
			inner = requestAnimationFrame(() => setBodyShown(true));
		});
		return () => {
			cancelAnimationFrame(outer);
			cancelAnimationFrame(inner);
		};
	}, [animateOpen]);
	// The owner's callbacks, read when they fire, not when they were given.
	const callbacks = useRef({ onClose, onOpened });
	useEffect(() => {
		callbacks.current = { onClose, onOpened };
	});
	// Called once, from whichever comes first: the animation's end or the
	// fallback. Cleared on unmount either way.
	const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => () => {
		if (fallback.current) clearTimeout(fallback.current);
	}, []);
	function finishClose() {
		if (fallback.current) clearTimeout(fallback.current);
		fallback.current = null;
		callbacks.current.onClose();
	}

	// The opening's end: the animation's, the fallback's, or — without
	// motion — right after mount.
	const opened = useRef(false);
	function finishOpen() {
		if (opened.current) return;
		opened.current = true;
		if (fallback.current) clearTimeout(fallback.current);
		fallback.current = null;
		callbacks.current.onOpened?.();
	}
	useEffect(() => {
		if (!animateOpen || prefersReducedMotion()) {
			finishOpen();
		} else {
			fallback.current = setTimeout(finishOpen, ANIMATION_FALLBACK_MS);
		}
		// Forgotten with the effect: a mount that is undone and redone (React's
		// StrictMode in development) must open again, or what onOpened set up
		// the first time — an AudioContext, closed by the undo — is never
		// set up again.
		return () => {
			opened.current = false;
		};
		// finishOpen reads refs only; animateOpen is fixed for the panel's life.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function requestClose() {
		if (closing) return;
		if (prefersReducedMotion()) {
			onClose();
			return;
		}
		setClosing(true);
		if (fallback.current) clearTimeout(fallback.current);
		fallback.current = setTimeout(finishClose, ANIMATION_FALLBACK_MS);
	}

	// The aside's own animationend, natively: React names that event after a
	// feature test the browser may fail, and the fallback should be the
	// fallback. Only the aside's own animation counts, not a child's.
	const asideRef = useRef<HTMLElement | null>(null);
	useEffect(() => {
		const el = asideRef.current;
		if (!el) return;
		function handleEnd(e: AnimationEvent | Event) {
			if (e.target !== el) return;
			if (closing) finishClose();
			else finishOpen();
		}
		el.addEventListener("animationend", handleEnd);
		return () => el.removeEventListener("animationend", handleEnd);
	}, [closing]);

	return (
		<aside
			ref={(el) => {
				asideRef.current = el;
				panelRef?.(el);
			}}
			aria-label={ariaLabel ?? label}
			data-testid={testId}
			data-closing={closing ? "" : undefined}
			// The animated class only when there is something to animate: a
			// panel taking another's place has no entrance, and gets the class
			// back for its exit.
			className={`${animateOpen || closing ? "side-panel " : ""}fixed inset-0 z-50 flex overflow-hidden bg-surface lg:relative lg:z-auto lg:h-full lg:w-1/2 lg:flex-none lg:border-l lg:border-line`}
		>
			{/* Full width from the first frame: half the viewport at lg, all of it below. */}
			<div className="flex h-full w-full flex-none flex-col lg:w-[calc(50vw-1px)]">
				<header className="flex h-10 flex-none items-center justify-between gap-3 border-b border-line px-4">
					<h2 className={`${EYEBROW} text-ink-dim`}>{label}</h2>
					<button
						type="button"
						aria-label="Close"
						onClick={requestClose}
						className="flex size-7 items-center justify-center text-ink-faint transition-colors duration-(--dur-hover) hover:text-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:-outline-offset-2"
					>
						<X className="size-4" strokeWidth={1.5} />
					</button>
				</header>
				{bodyShown ? children : null}
			</div>
		</aside>
	);
}
