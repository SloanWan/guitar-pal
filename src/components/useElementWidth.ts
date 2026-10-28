import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The content width of an element, kept current as it resizes. Returns a
 * callback ref to put on it and the width (0 until first measured). The
 * observer goes with the element and with the component.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number, T | null] {
	const [width, setWidth] = useState(0);
	const [node, setNode] = useState<T | null>(null);
	const observer = useRef<ResizeObserver | null>(null);

	const ref = useCallback((el: T | null) => {
		observer.current?.disconnect();
		observer.current = null;
		setNode(el);
		if (!el || typeof ResizeObserver === "undefined") return;
		observer.current = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
		observer.current.observe(el);
	}, []);

	useEffect(() => () => observer.current?.disconnect(), []);
	return [ref, width, node];
}

/** A length custom property of an element, in px (0 when unset). */
export function cssPx(el: Element | null, name: string): number {
	if (!el) return 0;
	return parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0;
}
