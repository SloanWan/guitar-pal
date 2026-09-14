"use client";

/**
 * Answers to a question, under the message that asked it.
 *
 * Each lands a beat after the one before it — the same arrival the examples
 * make on an empty panel — with backwards fill so it is not there until its
 * turn. Used for every choice the assistant puts to the player: which pattern,
 * fill it in or not, delete or keep, and the sentences it suggests when it did
 * not read one.
 */

export const OPTION_BUTTON =
	"flex items-center gap-1 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-(--dur-hover) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1";

const TONES = {
	ghost: "text-ink-dim hover:text-ink",
	outline: "border border-denim text-denim-accent hover:bg-denim hover:text-on-denim",
	fill: "border border-denim bg-denim text-on-denim hover:bg-denim-accent",
	// The one tone that throws work away.
	danger: "border border-destructive bg-destructive text-white hover:bg-destructive/90",
	// A sentence to take into the composer: read as text, not as a command.
	template: "border border-line-strong normal-case tracking-[0.04em] text-ink-dim hover:border-denim hover:text-denim-accent",
} as const;

export function Options({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-wrap items-center gap-1.5 pl-2">{children}</div>;
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
	return (
		<button
			type="button"
			onClick={onClick}
			className={`${OPTION_BUTTON} ${TONES[tone]} animate-[proposal-pop_0.35s_ease-out_backwards] motion-reduce:animate-none`}
			style={{ animationDelay: `${order * 0.14}s` }}
		>
			{icon}
			{children}
		</button>
	);
}
