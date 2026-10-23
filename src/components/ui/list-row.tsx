"use client";

import { cloneElement, isValidElement, type ComponentProps, type ComponentType, type ReactNode, type Ref, type SVGProps } from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
import type { ModuleKey } from "@/lib/moduleForPath";
import { PICK_PATH, PICK_VIEWBOX } from "@/lib/brand/pickMark";
import { usePress } from "@/components/ui/press";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** A row's module badge: its icon on a pick of the module colour. */
export function ModuleBadge({ icon: IconComp, className }: { icon: Icon; className?: string }) {
	return (
		<span className={cn("gp-badge", className)} aria-hidden>
			<svg className="gp-badge-pick" viewBox={PICK_VIEWBOX}>
				<path d={PICK_PATH} />
			</svg>
			<IconComp className="gp-badge-icon" strokeWidth={2} />
		</span>
	);
}

export interface ListRowProps extends Omit<ComponentProps<"button">, "title"> {
	title: ReactNode;
	subline?: ReactNode;
	/** The badge's icon; with `module`, the row wears that module's colour (a mixed list colours per row). */
	icon?: Icon;
	module?: ModuleKey;
	/** A favourite pick, a chevron, a mini grid. */
	trailing?: ReactNode;
	/** Lift: the chosen row. */
	selected?: boolean;
	asChild?: boolean;
	ref?: Ref<HTMLButtonElement>;
}

/**
 * A ≥ 56px navigable row (spec §8): badge, title and subline, trailing slot. It is a
 * NavCard underneath — it hops when pointed at and lifts when chosen. With `asChild` the
 * one child (a link) is the row.
 */
export function ListRow({
	title,
	subline,
	icon,
	module,
	trailing,
	selected,
	asChild = false,
	className,
	children,
	ref,
	type,
	...props
}: ListRowProps) {
	const pressRef = usePress(ref, { hop: true });
	const body = (
		<>
			{icon && <ModuleBadge icon={icon} />}
			<span className="gp-row-main">
				<span className="gp-row-t gp-title">{title}</span>
				{subline && <span className="gp-row-s">{subline}</span>}
			</span>
			{trailing && <span className="gp-row-trail">{trailing}</span>}
		</>
	);
	const shared = {
		ref: pressRef,
		"data-m": module,
		"aria-current": selected ? ("true" as const) : undefined,
		className: cn("gp-hop gp-row", className),
	};
	// asChild: the one child (a link) becomes the row; its own content is replaced by the slots
	if (asChild && isValidElement(children)) {
		return (
			<Slot.Root {...shared} {...props}>
				{cloneElement(children, undefined, body)}
			</Slot.Root>
		);
	}
	return (
		<button type={type ?? "button"} {...shared} {...props}>
			{body}
		</button>
	);
}
