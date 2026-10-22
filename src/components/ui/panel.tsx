import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A control area (spec §6): white, 14px, 16px of padding; on Snow the white alone sets it
 * apart, so no hairline and no shadow. The title is a sentence, never an eyebrow.
 */
export function Panel({ title, className, children, ...props }: Omit<ComponentProps<"section">, "title"> & { title?: ReactNode }) {
	return (
		<section className={cn("gp-panel", className)} {...props}>
			{title && <h2 className="gp-panel-title">{title}</h2>}
			{children}
		</section>
	);
}
