import { useEffect, useRef, type RefObject } from "react";
import { shouldRunPageShortcut } from "@/lib/keyboardShortcuts";
import { showPress } from "@/components/ui/press";

/**
 * Space is the transport anywhere on the page (see shouldRunPageShortcut), and the
 * play key sinks under it the way it sinks under a click: down with the key, back
 * up when it is let go. Subscribed once; the latest `onToggle` is always the one called.
 */
export function usePlayKey(pickRef: RefObject<HTMLButtonElement | null>, onToggle: () => void): void {
	const toggleRef = useRef(onToggle);
	useEffect(() => {
		toggleRef.current = onToggle;
	});
	useEffect(() => {
		let release: (() => void) | null = null;
		function handleKeyDown(e: KeyboardEvent) {
			if (e.code !== "Space" || !shouldRunPageShortcut(e)) return;
			e.preventDefault();
			// A held key repeats; one press is one toggle.
			if (e.repeat) return;
			release?.();
			release = pickRef.current ? showPress(pickRef.current) : null;
			toggleRef.current();
		}
		function handleKeyUp(e: KeyboardEvent) {
			if (e.code !== "Space") return;
			release?.();
			release = null;
		}
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		return () => {
			release?.();
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, [pickRef]);
}
