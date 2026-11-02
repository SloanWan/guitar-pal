"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Waits shorter than this draw no fill: a flash of grey is worse than a blank (spec §7). */
export const SKELETON_DELAY_MS = 300;

/** False until `ms` have passed since mount; the timer goes with the component. */
export function useDelayed(ms: number): boolean {
	const [shown, setShown] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setShown(true), ms);
		return () => clearTimeout(t);
	}, [ms]);
	return shown;
}

/**
 * A loading placeholder: a well-coloured block with a 1.2s shimmer. It holds its
 * size from the first frame, so the page is laid out as it will be; the fill is
 * drawn only once the wait passes 300ms. Size it to the content it stands in for,
 * inside the page's real frame: the cards and headings that need no data are
 * drawn as they are, and only what the data fills waits here.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
	const shown = useDelayed(SKELETON_DELAY_MS);
	return <div aria-hidden data-wait={shown ? undefined : ""} className={cn("gp-skeleton", className)} {...props} />;
}
