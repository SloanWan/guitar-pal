"use client";

import { useEffect } from "react";

/** How long the curtain takes to fade (shell.css `gp-launch-out`). */
const LIFT_MS = 220;

/**
 * Lifts the launch curtain (#490) once the page is ready — its first effect, after
 * hydration — and the mark's animation has played through, so a fast page never cuts it
 * short. The page renders under the curtain meanwhile. The stylesheet lifts it at 1.5 s
 * on its own, should this never run.
 */
export default function LaunchCurtain() {
	useEffect(() => {
		const root = document.documentElement;
		if (!root.hasAttribute("data-launch")) return;
		let live = true;
		let done: ReturnType<typeof setTimeout> | undefined;
		// None under reduced motion: it lifts at once.
		const playing = document.querySelector(".gp-launch-mark")?.getAnimations({ subtree: true }) ?? [];
		void Promise.all(playing.map((a) => a.finished.catch(() => undefined))).then(() => {
			if (!live) return;
			root.dataset.launch = "lifting";
			done = setTimeout(() => root.removeAttribute("data-launch"), LIFT_MS);
		});
		return () => {
			live = false;
			clearTimeout(done);
		};
	}, []);
	return null;
}
