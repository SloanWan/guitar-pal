"use client";

import { useCallback, useEffect, useRef } from "react";
import { createLogoPlayer, type PickPose } from "@/lib/brand/pickMark";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Drives the logo's arrival on a PickMark: returns a ref for the mark and a play()
 * that poses its picks on rAF (stopping at 780ms and on unmount). Under reduced
 * motion the mark simply fades in over 200ms.
 */
export function useLogoArrival() {
	const markRef = useRef<SVGSVGElement>(null);
	const playerRef = useRef<ReturnType<typeof createLogoPlayer> | null>(null);

	const apply = useCallback((poses: PickPose[]) => {
		const svg = markRef.current;
		if (!svg) return;
		svg.querySelectorAll<SVGGElement>("[data-pick]").forEach((g, j) => {
			const pose = poses[j];
			if (!pose || pose.transform === null) g.removeAttribute("transform");
			else g.setAttribute("transform", pose.transform);
			g.style.opacity = pose && pose.opacity !== null ? String(pose.opacity) : "";
		});
	}, []);

	useEffect(() => {
		playerRef.current = createLogoPlayer({
			apply,
			now: () => performance.now(),
			raf: (cb) => requestAnimationFrame(cb),
			cancel: (id) => cancelAnimationFrame(id),
			reducedMotion: prefersReducedMotion,
		});
		return () => {
			playerRef.current?.stop();
			playerRef.current = null;
		};
	}, [apply]);

	const play = useCallback((opts?: { collapse?: boolean }) => {
		const player = playerRef.current;
		if (!player) return;
		if (player.play(opts) === "reduced") {
			markRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "linear" });
		}
	}, []);

	const isRunning = useCallback(() => playerRef.current?.isRunning() ?? false, []);

	return { markRef, play, isRunning };
}
