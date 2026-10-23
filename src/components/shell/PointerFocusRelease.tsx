"use client";

import { useEffect } from "react";
import { releasesPointerFocus } from "@/lib/keyboardShortcuts";

/**
 * Lets go of the focus a click leaves behind on a button, a chip or a slider,
 * so nothing stays highlighted and space keeps meaning play / pause. Focus from
 * the keyboard (Tab) stays exactly where it is, ring and all.
 */
export default function PointerFocusRelease() {
	useEffect(() => {
		let frame = 0;
		function release() {
			cancelAnimationFrame(frame);
			// After the click has landed, and after anything it opened has taken focus.
			frame = requestAnimationFrame(() => {
				const active = document.activeElement;
				if (active instanceof HTMLElement && releasesPointerFocus(active)) active.blur();
			});
		}
		document.addEventListener("pointerup", release);
		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener("pointerup", release);
		};
	}, []);
	return null;
}
