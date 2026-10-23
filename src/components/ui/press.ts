"use client";

import { useCallback, type Ref, type RefCallback } from "react";

/** A press shows for at least this long, so a quick tap still reads as a sink (spec §7). */
export const PRESS_MIN_HOLD_MS = 90;
/** A touch on a navigable card hops it for this long — a finger has no hover (spec §6). */
export const TAP_HOP_MS = 280;

export interface PressOptions {
	/**
	 * A navigable card: a mouse press flattens it (`.is-down`), but a touch or pen hops
	 * it (`.is-hop`, held TAP_HOP_MS) — the hover a finger cannot give.
	 */
	hop?: boolean;
	now?: () => number;
}

const PRESS_KEYS = new Set([" ", "Enter"]);

/**
 * Puts `.is-down` on `el` while it is pressed — by pointer (primary button) or by
 * Enter / Space — and keeps it for at least PRESS_MIN_HOLD_MS. primitives.css draws
 * the sink from that class. Returns the unbind, which removes every listener and any
 * pending release.
 */
export function bindPress(el: HTMLElement, { hop = false, now = Date.now }: PressOptions = {}): () => void {
	let downAt = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let cls = "is-down";
	let hold = PRESS_MIN_HOLD_MS;

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
	const down = (tap = false) => {
		clear();
		el.classList.remove(cls);
		cls = tap ? "is-hop" : "is-down";
		hold = tap ? TAP_HOP_MS : PRESS_MIN_HOLD_MS;
		el.classList.add(cls);
		downAt = now();
	};
	const up = () => {
		watchRelease(false);
		if (!el.classList.contains(cls) || timer !== null) return;
		const left = hold - (now() - downAt);
		if (left <= 0) {
			el.classList.remove(cls);
			return;
		}
		timer = setTimeout(() => {
			timer = null;
			el.classList.remove(cls);
		}, left);
	};

	const onPointerDown = (e: PointerEvent) => {
		if (e.button !== 0 || disabled()) return;
		down(hop && e.pointerType !== "" && e.pointerType !== "mouse");
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
		el.classList.remove("is-down", "is-hop");
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
export function usePress<T extends HTMLElement>(ref?: Ref<T>, { hop = false }: { hop?: boolean } = {}): RefCallback<T> {
	return useCallback(
		(el: T | null) => {
			assignRef(ref, el);
			if (!el) return;
			const unbind = bindPress(el, { hop });
			return () => {
				unbind();
				assignRef(ref, null);
			};
		},
		[ref, hop],
	);
}
