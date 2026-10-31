"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Waits shorter than this show nothing: a flash of grey is worse than a blank (spec §7). */
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
 * A loading placeholder: a well-coloured block with a 1.2s shimmer, drawn only once the
 * wait passes 300ms. One per page — size it to the content it stands in for.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
	const shown = useDelayed(SKELETON_DELAY_MS);
	if (!shown) return null;
	return <div aria-hidden className={cn("gp-skeleton", className)} {...props} />;
}
