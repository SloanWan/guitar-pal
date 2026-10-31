"use client";

import type { ComponentProps, Ref } from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
import { usePress } from "@/components/ui/press";

/**
 * Static content (spec §6): a title, its meta, a description. It sits on the page itself —
 * no fill, no edge, no radius, no shadow. Controls go in a Panel instead.
 */
export function Card({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("gp-card", className)} {...props} />;
}

export interface NavCardProps extends ComponentProps<"button"> {
	/** Lift: the chosen card in a set is the one raised, with a module ring. */
	selected?: boolean;
	/** Renders the child (a link) with the card's look and hop instead of a <button>. */
	asChild?: boolean;
	ref?: Ref<HTMLButtonElement>;
}

/**
 * A navigable card (spec §6): white, 14px, a hairline at rest; it hops when pointed at,
 * focused, chosen or tapped, and flattens under a press. Put the title in a `gp-title`
 * element so it leans into italic and grows its underline on hover.
 */
export function NavCard({ selected, asChild = false, className, ref, type, ...props }: NavCardProps) {
	const pressRef = usePress(ref, { hop: true });
	const Comp = asChild ? Slot.Root : "button";
	return (
		<Comp
			ref={pressRef}
			type={asChild ? undefined : (type ?? "button")}
			aria-current={selected ? "true" : undefined}
			className={cn("gp-hop", className)}
			{...props}
		/>
	);
}
