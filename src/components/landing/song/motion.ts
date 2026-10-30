"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The small clocks the landing's step cards animate by. Each runs only while
 * its card is on screen, starts over when the card comes back, and — for a
 * reader who asked for less motion — skips straight to the finished state.
 */

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribeReduce(onChange: () => void): () => void {
	const mq = window.matchMedia(REDUCE);
	mq.addEventListener("change", onChange);
	return () => mq.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
	return useSyncExternalStore(
		subscribeReduce,
		() => window.matchMedia(REDUCE).matches,
		() => false,
	);
}

/** Whether the element is at least `threshold` on screen. */
export function useInView(ref: React.RefObject<Element | null>, threshold = 0.35): boolean {
	const [inView, setInView] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold });
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref, threshold]);
	return inView;
}

/**
 * Which phase of a timed sequence is showing: 0 until `active`, then 1, 2, …
 * each `delays[i]` ms after the one before, up to `delays.length`. Reset when
 * inactive; at the last phase at once under reduced motion.
 */
export function useSequence(active: boolean, delays: readonly number[]): number {
	const reduce = useReducedMotion();
	const [phase, setPhase] = useState(0);
	const key = delays.join(",");
	useEffect(() => {
		if (!active) {
			queueMicrotask(() => setPhase(0));
			return;
		}
		if (reduce) {
			queueMicrotask(() => setPhase(delays.length));
			return;
		}
		const timers: number[] = [];
		let at = 0;
		delays.forEach((d, i) => {
			at += d;
			timers.push(window.setTimeout(() => setPhase(i + 1), at));
		});
		return () => timers.forEach((t) => clearTimeout(t));
		// `key` stands for `delays`, which callers pass as a fresh array.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, reduce, key]);
	return phase;
}

/** How many characters of `text` are typed: all of them at once under reduced motion. */
export function useTypewriter(text: string, active: boolean, msPerChar = 28): number {
	const reduce = useReducedMotion();
	const [count, setCount] = useState(0);
	useEffect(() => {
		if (!active) {
			queueMicrotask(() => setCount(0));
			return;
		}
		if (reduce) {
			queueMicrotask(() => setCount(text.length));
			return;
		}
		let n = 0;
		const id = window.setInterval(() => {
			n += 1;
			setCount(n);
			if (n >= text.length) clearInterval(id);
		}, msPerChar);
		return () => clearInterval(id);
	}, [text, active, reduce, msPerChar]);
	return count;
}

/** A counter that ticks every `ms` while `active` — for a card that walks through its items. */
export function useTicker(active: boolean, ms: number): number {
	const reduce = useReducedMotion();
	const [tick, setTick] = useState(0);
	useEffect(() => {
		if (!active || reduce) return;
		const id = window.setInterval(() => setTick((t) => t + 1), ms);
		return () => clearInterval(id);
	}, [active, reduce, ms]);
	return tick;
}
