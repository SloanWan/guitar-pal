"use client";

import { usePress } from "@/components/ui/press";

/**
 * Answers to a question, under the message that asked it.
 *
 * Each lands a beat after the one before it — the same arrival the examples
 * make on an empty panel — with backwards fill so it is not there until its
 * turn. Used for every choice the assistant puts to the player: which pattern,
 * fill it in or not, delete or keep, and the sentences it suggests when it did
 * not read one. Candy chips: raised and neutral, the module colour for the one
 * that goes ahead, red for the one that throws work away, flat for "not now".
 */

const TONES = {
	ghost: "gp-focus",
	outline: "gp-press gp-tone-neutral",
	fill: "gp-press gp-tone-primary",
	// The one tone that throws work away.
	danger: "gp-press gp-tone-danger",
	// A sentence to take into the composer: read as text, not as a command.
	template: "gp-press gp-tone-neutral",
} as const;

export function Options({ children }: { children: React.ReactNode }) {
	return <div className="as-opts">{children}</div>;
}

export function Option({
	order,
	tone,
	onClick,
	icon,
	children,
}: {
	order: number;
	tone: keyof typeof TONES;
	onClick: () => void;
	icon?: React.ReactNode;
	children: React.ReactNode;
}) {
	const pressRef = usePress<HTMLButtonElement>();
	return (
		<button
			ref={tone === "ghost" ? undefined : pressRef}
			type="button"
			onClick={onClick}
			data-tone={tone}
			className={`gp-chip as-opt ${TONES[tone]}`}
			style={{ animationDelay: `${order * 0.14}s` }}
		>
			{icon}
			{children}
		</button>
	);
}
