"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/AppLink";
import { PickMark } from "@/components/ui/pick";
import { useLogoArrival } from "@/components/useLogoArrival";

const ARRIVED_KEY = "gp-logo-arrived";

/** Records that the arrival has played this session; false if it already had. */
function claimArrival(): boolean {
	try {
		if (sessionStorage.getItem(ARRIVED_KEY)) return false;
		sessionStorage.setItem(ARRIVED_KEY, "1");
	} catch {
		// storage blocked: play every time rather than never
	}
	return true;
}

/**
 * The header brand: the Resting-pick mark and the word mark, linking Home. The mark
 * arrives once per session on Home, and replays (closing first) when a mouse or pen
 * hovers it, or when a finger taps it — never while it is already playing. A mouse
 * click plays nothing of its own. Every click claims the arrival, so landing on Home
 * does not start a second one.
 */
export default function BrandLink({ className }: { className?: string }) {
	const pathname = usePathname();
	const { markRef, play, isRunning } = useLogoArrival();
	const lastPointer = useRef<string>("mouse");

	useEffect(() => {
		if ((pathname === "/home" || pathname === "/") && claimArrival()) play();
	}, [pathname, play]);

	const replay = () => {
		if (!isRunning()) play({ collapse: true });
	};
	const onHover = (e: React.PointerEvent) => {
		if (e.pointerType !== "touch") replay();
	};
	const onClick = () => {
		claimArrival();
		// a tap has no hover, so the tap itself plays it (the header stays mounted while Home loads)
		if (lastPointer.current === "touch") replay();
	};

	return (
		<Link
			href="/"
			aria-label="Guitar Pal home"
			className={className}
			onPointerDown={(e) => (lastPointer.current = e.pointerType)}
			onPointerEnter={onHover}
			onClick={onClick}
		>
			<PickMark ref={markRef} className="size-7 flex-none" />
			<span className="hidden font-gp-display text-[17px] font-bold tracking-[-0.01em] nav:block">Guitar Pal</span>
		</Link>
	);
}
