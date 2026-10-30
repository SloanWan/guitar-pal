"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { prefersReducedMotion } from "@/lib/motion";
import { Button } from "@/components/ui/button";

/**
 * The panel beside the book (#233, #240, on Candy #404): from 960px a card
 * beside the chapters, kept in view as the page scrolls; below that a sheet
 * over the page (from the right on a tablet, from the bottom on a phone)
 * with a scrim, closed by the scrim or Escape. What goes in it — a draft to
 * play, a page to read, a text tab to read by ear — is the caller's.
 *
 * It moves in on `--gp-d-sheet` and out on `--gp-d-sheet-out` (books.css).
 * The body is mounted a frame after the aside: what goes in it can be heavy
 * to lay out (a tab's staves, an audio engine), and done at mount it would
 * hold the first paint back and skip the start of the motion; `onOpened`
 * fires once the entrance is over, for what should wait for it. Close plays
 * the exit and only then tells the owner, which unmounts it — or after the
 * animation's length, should the animation never end (a stylesheet not yet
 * there, a browser that dropped it). A panel that replaces one already open
 * (`animateOpen={false}`) skips all of that: the place is there, only what is
 * in it changes.
 */

/** `--gp-d-sheet` (tokens.css), plus slack, for the fallbacks. */
const ANIMATION_FALLBACK_MS = 500;

export default function SidePanel({
	eyebrow,
	title,
	meta,
	ariaLabel,
	onClose,
	onBack,
	onOpened,
	animateOpen = true,
	testId,
	footer,
	bare = false,
	children,
}: {
	/** The small line over the title: what kind of thing this is, and where from. */
	eyebrow: React.ReactNode;
	title: React.ReactNode;
	meta?: React.ReactNode;
	/** The landmark's name. */
	ariaLabel: string;
	onClose: () => void;
	/** A way back to what opened this (the draft a page was opened from). */
	onBack?: () => void;
	/**
	 * Once the opening motion is over (or at once, without motion): where to
	 * start anything heavy that need not be there for the first frame.
	 */
	onOpened?: () => void;
	/** False when this panel takes the place of one already open: no motion, no wait. */
	animateOpen?: boolean;
	testId?: string;
	/** Actions pinned under the body. */
	footer?: React.ReactNode;
	/** The body lays itself out (its own scroll, its own footer): no padding, no scroll here. */
	bare?: boolean;
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
	useEffect(
		() => () => {
			if (fallback.current) clearTimeout(fallback.current);
		},
		[],
	);
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
	const closeRef = useRef(requestClose);
	useEffect(() => {
		closeRef.current = requestClose;
	});

	// Escape closes it, unless something on top of it (a dialog, a menu) has it.
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"]')) return;
			closeRef.current();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

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

	// The motion only when there is something to move: a panel taking another's
	// place has no entrance, and gets it back for its exit.
	const motion = animateOpen || closing ? "" : undefined;
	return (
		<>
			<div
				className="bk-scrim"
				aria-hidden
				data-motion={motion}
				data-closing={closing ? "" : undefined}
				onClick={requestClose}
			/>
			<aside
				ref={asideRef}
				aria-label={ariaLabel}
				data-testid={testId}
				data-motion={motion}
				data-closing={closing ? "" : undefined}
				className="bk-panel"
			>
				<span className="bk-grab" aria-hidden />
				<header className="bk-pnl-h">
					{onBack ? (
						<Button variant="ghost" size="sm" aria-label="Back to the draft" onClick={onBack} className="bk-pnl-icon">
							<ArrowLeft aria-hidden />
						</Button>
					) : null}
					<div className="bk-pnl-t">
						<span className="bk-eb">{eyebrow}</span>
						<h2 className="bk-pnl-title">{title}</h2>
						{meta ? <span className="bk-meta">{meta}</span> : null}
					</div>
					<Button variant="ghost" size="sm" aria-label="Close" onClick={requestClose} className="bk-pnl-icon">
						<X aria-hidden />
					</Button>
				</header>
				{bodyShown ? (
					<>
						{bare ? children : <div className="bk-pnl-b">{children}</div>}
						{footer ? <footer className="bk-pnl-f">{footer}</footer> : null}
					</>
				) : null}
			</aside>
		</>
	);
}
