"use client";

import { useCallback, type Ref, type RefCallback } from "react";

/** A press shows for at least this long, so a quick tap still reads as a sink (spec §7). */
export const PRESS_MIN_HOLD_MS = 90;

const PRESS_KEYS = new Set([" ", "Enter"]);

/**
 * Puts `.is-down` on `el` while it is pressed — by pointer (primary button) or by
 * Enter / Space — and keeps it for at least PRESS_MIN_HOLD_MS. primitives.css draws
 * the sink from that class. Returns the unbind, which removes every listener and any
 * pending release.
 */
export function bindPress(el: HTMLElement, now: () => number = Date.now): () => void {
	let downAt = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const clear = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	};
	// a pointer released off the element (or over it once it turned disabled) still ends the press
	const watchRelease = (on: boolean) => {
		const method = on ? "addEventListener" : "removeEventListener";
		window[method]("pointerup", up);
		window[method]("pointercancel", up);
	};
	const disabled = () => el.matches(":disabled, [aria-disabled='true']");
	const down = () => {
		clear();
		el.classList.add("is-down");
		downAt = now();
	};
	const up = () => {
		watchRelease(false);
		if (!el.classList.contains("is-down") || timer !== null) return;
		const left = PRESS_MIN_HOLD_MS - (now() - downAt);
		if (left <= 0) {
			el.classList.remove("is-down");
			return;
		}
		timer = setTimeout(() => {
			timer = null;
			el.classList.remove("is-down");
		}, left);
	};

	const onPointerDown = (e: PointerEvent) => {
		if (e.button !== 0 || disabled()) return;
		down();
		watchRelease(true);
	};
	const onKeyDown = (e: KeyboardEvent) => {
		if (PRESS_KEYS.has(e.key) && !e.repeat && !disabled()) down();
	};
	const onKeyUp = (e: KeyboardEvent) => {
		if (PRESS_KEYS.has(e.key)) up();
	};

	const listeners: [string, EventListener][] = [
		["pointerdown", onPointerDown as EventListener],
		["pointerleave", up],
		["keydown", onKeyDown as EventListener],
		["keyup", onKeyUp as EventListener],
		["blur", up],
	];
	for (const [type, fn] of listeners) el.addEventListener(type, fn);
	return () => {
		for (const [type, fn] of listeners) el.removeEventListener(type, fn);
		watchRelease(false);
		clear();
		el.classList.remove("is-down");
	};
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
	if (typeof ref === "function") ref(value);
	else if (ref) ref.current = value;
}

/**
 * The shared press behaviour for every pressable primitive: a callback ref that binds
 * the press while the element is mounted. Pass the component's own `ref` prop through
 * so a caller's ref still lands on the element.
 */
export function usePress<T extends HTMLElement>(ref?: Ref<T>): RefCallback<T> {
	return useCallback(
		(el: T | null) => {
			assignRef(ref, el);
			if (!el) return;
			const unbind = bindPress(el);
			return () => {
				unbind();
				assignRef(ref, null);
			};
		},
		[ref],
	);
}
