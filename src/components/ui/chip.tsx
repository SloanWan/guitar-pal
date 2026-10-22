"use client";

import type { ComponentProps, Ref } from "react";
import { cn } from "@/lib/utils";
import { usePress } from "@/components/ui/press";

export interface ChipProps extends Omit<ComponentProps<"button">, "onChange"> {
	/**
	 * Makes it a toggle chip: flat with a 1px edge while off, filled with the module
	 * colour and raised once chosen. Left out, it is an action chip (neutral, raised).
	 */
	pressed?: boolean;
	onPressedChange?: (pressed: boolean) => void;
	ref?: Ref<HTMLButtonElement>;
}

/** A 34px chip (spec §8): an action, or a toggle when `pressed` is given. */
export function Chip({ pressed, onPressedChange, className, onClick, ref, type, ...props }: ChipProps) {
	const pressRef = usePress(ref);
	const toggle = pressed !== undefined;
	return (
		<button
			ref={pressRef}
			type={type ?? "button"}
			aria-pressed={pressed}
			className={cn("gp-chip gp-press", toggle && pressed ? "gp-tone-primary" : "gp-tone-neutral", className)}
			onClick={(e) => {
				onClick?.(e);
				if (toggle && !e.defaultPrevented) onPressedChange?.(!pressed);
			}}
			{...props}
		/>
	);
}
