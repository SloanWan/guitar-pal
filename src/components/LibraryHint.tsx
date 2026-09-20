"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MoveRight } from "lucide-react";

/**
 * A first-visit pointer at the collapsed library's toggle.
 *
 * Below lg the pattern library is a drawer behind one square icon, and on a
 * first visit nothing says so: the page opens on a pattern with no sign of
 * where the others are. So, once per page, a label and a nudging arrow sit
 * beside the toggle until it is pressed or a few seconds have passed.
 * Remembered on the device — a hint that came back every time would be a
 * decoration, and the one thing it says is learned the first time.
 */

const seenKey = (page: string) => `guitarpal:libraryHint:${page}`;

// Storage is best-effort: a private window throws on write, and reads there
// mean the hint shows again next time — nothing worse.
function isSeen(page: string): boolean {
	try {
		return localStorage.getItem(seenKey(page)) !== null;
	} catch {
		return true;
	}
}
function markSeen(page: string): void {
	try {
		localStorage.setItem(seenKey(page), "1");
	} catch {
		// See above.
	}
	for (const notify of listeners) notify();
}

/** Who is showing a hint right now; told when one is put away. */
const listeners = new Set<() => void>();
function subscribe(notify: () => void): () => void {
	listeners.add(notify);
	return () => listeners.delete(notify);
}

/** How long the hint stays before it counts as seen: long enough to be noticed, short enough not to nag. */
const HINT_MS = 12_000;

/**
 * Whether to show the hint on this page, and how to put it away. `dismiss`
 * is for the toggle's own click; otherwise the hint counts as seen after it
 * has been on screen a while. Read through an external store rather than
 * state set in an effect: the server's markup never carries a hint (its
 * snapshot is "seen"), and the client's first render after hydration reads
 * the device's answer.
 */
export function useLibraryHint(page: "strum" | "fingerpick"): { show: boolean; dismiss: () => void } {
	const show = useSyncExternalStore(
		subscribe,
		() => !isSeen(page),
		() => false,
	);
	useEffect(() => {
		if (!show) return;
		const timer = setTimeout(() => markSeen(page), HINT_MS);
		return () => clearTimeout(timer);
	}, [page, show]);
	return { show, dismiss: () => markSeen(page) };
}

/**
 * The pointer itself: positioned by its parent, beside the toggle, and
 * shown or hidden with it. Purely decorative — the toggle is the control.
 */
export default function LibraryHint({ className = "" }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={`pointer-events-none flex h-10 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent ${className}`}
		>
			Library
			<MoveRight
				className="size-4 animate-[hint-nudge_1.2s_ease-in-out_infinite] motion-reduce:animate-none"
				strokeWidth={1.5}
				aria-hidden="true"
			/>
		</span>
	);
}
