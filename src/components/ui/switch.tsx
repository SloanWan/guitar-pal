"use client";

import type { ComponentProps, ReactNode } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export interface SwitchProps extends ComponentProps<typeof SwitchPrimitive.Root> {
	/** Written to the right of the switch; the whole row (≥ 44px) toggles it. */
	label?: ReactNode;
}

/** A 44×26 switch (spec §8): the edge colour off, the module colour on, a springing thumb. */
export function Switch({ label, className, ...props }: SwitchProps) {
	const control = (
		<SwitchPrimitive.Root className={cn("gp-sw gp-focus", !label && className)} {...props}>
			<SwitchPrimitive.Thumb className="gp-sw-thumb" />
		</SwitchPrimitive.Root>
	);
	if (!label) return control;
	return (
		<label className={cn("gp-sw-row", className)}>
			{control}
			<span>{label}</span>
		</label>
	);
}
