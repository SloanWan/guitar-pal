"use client";

// Global navigation progress indicator.
//
// App Router client-side navigation is History API + an RSC fetch — there is no
// document navigation, so the browser shows no loading UI. This is the deliberate
// replacement: the previous page stays on screen and a top-edge progress bar runs
// while the next route is in flight.
//
// Pending is tracked in an EXTERNAL store (a plain counter with subscribers), not
// React state in the context value. That matters: on a page like /chords/all there
// can be ~450 <LinkPending> consumers (one per lazy-loaded chord-card AppLink). If
// the counter lived in a context value, every count change would re-render all of
// them. Instead the context carries only the stable store object (never changes
// identity → never re-renders consumers), begin/end mutate the counter directly,
// and only the bar subscribes to pending via useSyncExternalStore.
//
// Two sources feed the store, both resolving to the same "navigation pending"
// signal:
//   - <AppLink> publishes useLinkStatus() (link clicks / prefetch-in-flight)
//   - useNavTransition() publishes a useTransition() around router.push()
// The counter (not a boolean) keeps overlapping navigations from cancelling out.

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
	useTransition,
	type ReactNode,
	type TransitionStartFunction,
} from "react";

interface NavStore {
	begin: () => void;
	end: () => void;
	subscribe: (onChange: () => void) => () => void;
	getPending: () => boolean;
}

function createNavStore(): NavStore {
	let count = 0;
	let pending = false;
	const listeners = new Set<() => void>();
	// Only notify when the derived boolean flips, so overlapping navigations
	// (count 1→2→1) don't churn the single subscriber.
	const sync = () => {
		const next = count > 0;
		if (next !== pending) {
			pending = next;
			listeners.forEach((l) => l());
		}
	};
	return {
		begin() {
			count += 1;
			sync();
		},
		end() {
			count = Math.max(0, count - 1);
			sync();
		},
		subscribe(onChange) {
			listeners.add(onChange);
			return () => listeners.delete(onChange);
		},
		getPending() {
			return pending;
		},
	};
}

// Carries only the stable store object — consuming it never triggers a re-render.
const NavStoreContext = createContext<NavStore | null>(null);

export function NavProgressProvider({ children }: { children: ReactNode }) {
	const [store] = useState(createNavStore);
	return (
		<NavStoreContext.Provider value={store}>{children}</NavStoreContext.Provider>
	);
}

function useNavStore(): NavStore {
	const store = useContext(NavStoreContext);
	if (!store) {
		throw new Error("useNavProgress must be used within <NavProgressProvider>");
	}
	return store;
}

// Reflect a boolean pending signal into the store for as long as it holds. Reads
// only the stable store object, so a component using this never re-renders when the
// pending count changes — the whole point of the external-store design.
export function usePublishPending(pending: boolean): void {
	const store = useNavStore();
	useEffect(() => {
		if (!pending) return;
		store.begin();
		return store.end;
	}, [pending, store]);
}

// useTransition wired to the store — wrap router.push() so programmatic navigations
// drive the bar. React keeps the current page visible during the transition, which
// is exactly the "old page stays, bar runs" behaviour we want.
export function useNavTransition(): TransitionStartFunction {
	const [isPending, startTransition] = useTransition();
	usePublishPending(isPending);
	return startTransition;
}

// Simulated progress. Real completion is unknowable for an RSC navigation, so the
// curve is faked to the standard convention: jump to 10%, then decelerate toward
// (but never reach) 90%, and snap to 100% on finish. The deceleration is what reads
// as progress rather than decoration.
const SHOW_DELAY_MS = 180; // skip the bar entirely for navigations faster than this
const MIN_VISIBLE_MS = 300; // once shown, keep it up at least this long
const TRICKLE_MS = 200;
const FINISH_HOLD_MS = 200;
const FADE_MS = 200;

type Phase = "hidden" | "active" | "exiting";

export function NavProgressBar() {
	const store = useNavStore();
	const pending = useSyncExternalStore(
		store.subscribe,
		store.getPending,
		() => false,
	);

	const [progress, setProgress] = useState(0);
	const [phase, setPhase] = useState<Phase>("hidden");
	// Mirror phase into a ref (updated alongside every setPhase) so the pending
	// effect can read the current phase without listing it as a dependency —
	// writing the ref during render is disallowed, so it is done at each setter.
	const phaseRef = useRef<Phase>("hidden");
	const setPhaseBoth = useCallback((p: Phase) => {
		phaseRef.current = p;
		setPhase(p);
	}, []);
	const timers = useRef<number[]>([]);
	const shownAt = useRef(0);

	const [reducedMotion] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
	);

	useEffect(() => {
		const clearTimers = () => {
			timers.current.forEach(clearTimeout);
			timers.current = [];
		};
		const after = (ms: number, fn: () => void) => {
			timers.current.push(window.setTimeout(fn, ms));
		};

		if (pending) {
			clearTimers();
			// Threshold 1: only reveal if the navigation outlives SHOW_DELAY_MS, so
			// warm ~10ms cache hits never flash the bar.
			after(SHOW_DELAY_MS, () => {
				shownAt.current = Date.now();
				setPhaseBoth("active");
				if (reducedMotion) {
					setProgress(100); // static bar; no simulated motion
					return;
				}
				setProgress(10);
				const tick = () => {
					// Decelerate toward 90%: each step closes 10% of the remaining gap.
					setProgress((p) => (p < 90 ? p + (90 - p) * 0.1 : p));
					after(TRICKLE_MS, tick);
				};
				after(TRICKLE_MS, tick);
			});
		} else {
			clearTimers();
			if (phaseRef.current !== "active") {
				setPhaseBoth("hidden");
				return;
			}
			// Threshold 2: honour a minimum on-screen time before completing.
			const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
			after(wait, () => {
				setProgress(100);
				after(FINISH_HOLD_MS, () => {
					setPhaseBoth("exiting");
					after(FADE_MS, () => {
						setPhaseBoth("hidden");
						setProgress(0);
					});
				});
			});
		}
	}, [pending, reducedMotion, setPhaseBoth]);

	useEffect(
		() => () => {
			timers.current.forEach(clearTimeout);
		},
		[],
	);

	return (
		<>
			{/* Screen-reader feedback via a polite live region — NOT aria-valuenow,
			    since the percentage is fabricated and would mislead. */}
			<div aria-live="polite" className="sr-only">
				{phase === "active" ? "Loading page" : ""}
			</div>
			{phase !== "hidden" && (
				<div
					aria-hidden="true"
					className={`nav-progress${phase === "exiting" ? " is-exiting" : ""}`}
				>
					<div className="nav-progress-fill" style={{ width: `${progress}%` }} />
				</div>
			)}
		</>
	);
}
