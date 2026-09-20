"use client";

import { useEffect } from "react";

/**
 * Keeps iOS Safari from zooming the page into a focused field.
 *
 * Safari zooms into any field set below 16px the moment it is focused, and
 * does not zoom back out. Setting every field to 16px on a phone would stop
 * that, but at the cost of every small control — the capo badge, the chord
 * search, the editor's selects — growing out of step with the text beside
 * it. A viewport capped at scale 1 stops the focus zoom instead, and since
 * iOS 10 Safari ignores the cap for the pinch a person makes, so nothing is
 * lost. Applied on iOS only: Android does not zoom on focus, and there the
 * cap would really disable pinch zoom.
 */
export default function NoFocusZoom() {
	useEffect(() => {
		const ua = navigator.userAgent;
		const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
		if (!iOS) return;
		const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
		if (!meta) return;
		const before = meta.content;
		meta.content = "width=device-width, initial-scale=1, maximum-scale=1";
		return () => {
			meta.content = before;
		};
	}, []);
	return null;
}
