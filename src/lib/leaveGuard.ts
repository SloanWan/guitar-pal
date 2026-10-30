/**
 * A page with unsaved work holds in-app navigation here (#358). Every link in
 * the app is an `AppLink`, which asks `mayNavigate` before a client-side
 * navigation; while a guard is set it answers, and a link it refuses does not
 * navigate — the guard is expected to ask the player and navigate itself.
 * One guard at a time: one page is on screen.
 */

/** Returns false to hold the navigation to `href`. */
export type LeaveGuard = (href: string) => boolean;

let current: LeaveGuard | null = null;

/** Sets the guard; the returned function removes it (only if it is still this one). */
export function setLeaveGuard(guard: LeaveGuard): () => void {
	current = guard;
	return () => {
		if (current === guard) current = null;
	};
}

export function mayNavigate(href: string): boolean {
	return current === null || current(href);
}
