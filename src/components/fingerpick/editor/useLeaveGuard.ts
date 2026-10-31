import { useCallback, useEffect, useRef, useState } from "react";
import { setLeaveGuard } from "@/lib/leaveGuard";

/** A way out the player took with unsaved edits, held until they choose. */
export type LeaveAttempt = { kind: "link" | "close"; href: string } | { kind: "back" };

interface Navigate {
	/** Goes to `href` in place of the editor (Next's `router.replace`). */
	replace: (href: string) => void;
	push: (href: string) => void;
}

/**
 * Keeps unsaved edits from being lost on the way out (#358). While `dirty`:
 * a link anywhere in the app is held (`setLeaveGuard`), the browser's back
 * button is held (a duplicate history entry is pushed for it to consume), and
 * a reload or a closed tab asks the browser's own question (`beforeunload`).
 * A held attempt waits in `attempt` for `keep` or `discard`. None of these
 * listeners exist while the tab is clean, and all are removed on unmount.
 *
 * `leave(href)` is the editor's own way out — Close on a clean tab, Save —
 * and never asks.
 */
export function useLeaveGuard(dirty: boolean, navigate: Navigate) {
	const [attempt, setAttempt] = useState<LeaveAttempt | null>(null);
	// The duplicate entry the back button lands on first; pushed once per stretch of edits.
	const guardEntryRef = useRef(false);
	// Set once the player has chosen to go: nothing is held after that.
	const leavingRef = useRef(false);
	const navigateRef = useRef(navigate);
	useEffect(() => {
		navigateRef.current = navigate;
	});

	useEffect(() => {
		if (!dirty) return;
		if (!guardEntryRef.current) {
			window.history.pushState(window.history.state, "", window.location.href);
			guardEntryRef.current = true;
		}
		function onPopState() {
			if (leavingRef.current) return;
			// The guard entry is spent; the editor is still on screen.
			guardEntryRef.current = false;
			setAttempt({ kind: "back" });
		}
		function onBeforeUnload(e: BeforeUnloadEvent) {
			e.preventDefault();
			// Older browsers want a string; the text itself is never shown.
			e.returnValue = "";
		}
		const removeGuard = setLeaveGuard((href) => {
			if (leavingRef.current) return true;
			setAttempt({ kind: "link", href });
			return false;
		});
		window.addEventListener("popstate", onPopState);
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => {
			removeGuard();
			window.removeEventListener("popstate", onPopState);
			window.removeEventListener("beforeunload", onBeforeUnload);
		};
	}, [dirty]);

	/** Out without asking. The guard entry, if there is one, is stepped back over first. */
	const leave = useCallback((href: string) => {
		leavingRef.current = true;
		if (!guardEntryRef.current) {
			navigateRef.current.replace(href);
			return;
		}
		guardEntryRef.current = false;
		window.addEventListener("popstate", () => navigateRef.current.replace(href), { once: true });
		window.history.back();
	}, []);

	/** Close: asks first when there is something to lose. */
	const request = useCallback(
		(href: string) => {
			if (dirty) setAttempt({ kind: "close", href });
			else leave(href);
		},
		[dirty, leave],
	);

	const keep = useCallback(() => {
		// A held back press spent the guard entry; the next one is held again.
		if (attempt?.kind === "back" && !guardEntryRef.current) {
			window.history.pushState(window.history.state, "", window.location.href);
			guardEntryRef.current = true;
		}
		setAttempt(null);
	}, [attempt]);

	const discard = useCallback(() => {
		const held = attempt;
		setAttempt(null);
		if (!held) return;
		if (held.kind === "close") {
			leave(held.href);
			return;
		}
		leavingRef.current = true;
		if (held.kind === "back") window.history.back();
		else navigateRef.current.push(held.href);
	}, [attempt, leave]);

	return { attempt, request, leave, keep, discard };
}
