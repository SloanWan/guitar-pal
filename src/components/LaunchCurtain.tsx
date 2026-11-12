"use client";

import { useEffect } from "react";

/** How long the curtain takes to fade (shell.css `gp-launch-out`). */
const LIFT_MS = 220;

/**
 * Lifts the launch curtain (#490) as soon as the page is ready — its first effect, after
 * hydration — never holding a ready page for the animation. The stylesheet lifts it at
 * 1.5 s on its own, should this never run.
 */
export default function LaunchCurtain() {
	useEffect(() => {
		const root = document.documentElement;
		if (!root.hasAttribute("data-launch")) return;
		root.dataset.launch = "lifting";
		const done = setTimeout(() => root.removeAttribute("data-launch"), LIFT_MS);
		return () => clearTimeout(done);
	}, []);
	return null;
}
