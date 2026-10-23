"use client";

import type { ComponentProps, MouseEvent, ReactNode, Ref } from "react";
import { Slot } from "radix-ui";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { PICK_PATH, PICK_VIEWBOX } from "@/lib/brand/pickMark";
import { Pick } from "@/components/ui/pick";
import { usePress } from "@/components/ui/press";

export type ButtonVariant = "primary" | "secondary" | "ink" | "danger" | "ghost" | "icon";
/** 44 / 40 / 34px on a phone, 40 / 36 / 32px from 960px. */
export type ButtonSize = "md" | "sm" | "xs";

const TONE: Record<Exclude<ButtonVariant, "ghost">, string> = {
	primary: "gp-tone-primary",
	secondary: "gp-tone-neutral",
	ink: "gp-tone-ink",
	danger: "gp-tone-danger",
	icon: "gp-tone-neutral",
};

/** The class list of a Candy button, for an element that cannot be a <Button>. */
export function buttonClasses(variant: ButtonVariant = "primary", className?: string): string {
	return cn("gp-btn", variant === "ghost" ? "gp-focus" : ["gp-press", TONE[variant]], className);
}

export interface ButtonProps extends ComponentProps<"button"> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	/** Shows three bouncing picks in place of the content and ignores clicks. */
	loading?: boolean;
	/** Renders the child (a link) with the button's look and press instead of a <button>. */
	asChild?: boolean;
	ref?: Ref<HTMLButtonElement>;
}

/**
 * The Candy button (spec §8). Every variant but `ghost` is a pressable: a tonal hard
 * shadow it sinks into. `primary` takes the page's module colour; `icon` is a square
 * neutral button and needs an aria-label.
 */
export function Button({
	variant = "primary",
	size = "md",
	loading = false,
	asChild = false,
	className,
	children,
	onClick,
	ref,
	type,
	...props
}: ButtonProps) {
	const pressRef = usePress(ref);
	const Comp = asChild ? Slot.Root : "button";
	const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
		if (loading) {
			e.preventDefault();
			return;
		}
		onClick?.(e);
	};
	return (
		<Comp
			ref={pressRef}
			type={asChild ? undefined : (type ?? "button")}
			data-variant={variant}
			data-size={size === "md" ? undefined : size}
			data-loading={loading ? "" : undefined}
			aria-busy={loading || undefined}
			className={buttonClasses(variant, className)}
			onClick={handleClick}
			{...props}
		>
			{asChild ? children : <ButtonContent loading={loading}>{children}</ButtonContent>}
		</Comp>
	);
}

function ButtonContent({ loading, children }: { loading: boolean; children: ReactNode }) {
	return (
		<>
			<span className="gp-btn-label">{children}</span>
			{loading && (
				<span className="gp-btn-picks" aria-hidden>
					<Pick />
					<Pick />
					<Pick />
				</span>
			)}
		</>
	);
}

export interface PlayPickProps extends Omit<ComponentProps<"button">, "children"> {
	playing: boolean;
	size?: "md" | "sm";
	ref?: Ref<HTMLButtonElement>;
}

/**
 * The pick-shaped Play button — the only 4px shadow (3px when `sm`). Its accessible
 * name follows `playing` unless an aria-label is given.
 */
export function PlayPick({ playing, size = "md", className, ref, type, ...props }: PlayPickProps) {
	const pressRef = usePress(ref);
	const Icon = playing ? Pause : Play;
	return (
		<button
			ref={pressRef}
			type={type ?? "button"}
			aria-label={playing ? "Stop" : "Play"}
			data-size={size === "md" ? undefined : size}
			className={cn("gp-playpick", className)}
			{...props}
		>
			<svg className="gp-playpick-shape" viewBox={PICK_VIEWBOX} aria-hidden>
				<path d={PICK_PATH} />
			</svg>
			<Icon className="gp-playpick-icon" fill="currentColor" strokeWidth={0} aria-hidden />
		</button>
	);
}
