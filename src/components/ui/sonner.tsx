"use client";

import { usePathname } from "next/navigation";
import { Toaster as Sonner } from "sonner";
import { moduleForPath } from "@/lib/moduleForPath";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/** 2.1s held after a 440ms arrival (spec §7). */
const TOAST_MS = 2540;

/**
 * Toasts (spec §8): ink, at least 44px, a pick of the page's module on the left. They drop
 * from the top centre on a phone and sit top right, under the header, from 720px. Sonner
 * keeps the stacking, the swipe and the polite live region; the look is `gp-toast`.
 */
export function Toaster() {
	const pathname = usePathname();
	const wide = useMediaQuery("(min-width: 720px)");
	return (
		<div className="gp-toaster" data-m={moduleForPath(pathname)}>
			<Sonner
				position={wide ? "top-right" : "top-center"}
				offset={wide ? { top: 68, right: 24 } : { top: 12 }}
				mobileOffset={{ top: 12 }}
				duration={TOAST_MS}
				gap={8}
				toastOptions={{ unstyled: true, classNames: { toast: "gp-toast" } }}
			/>
		</div>
	);
}
