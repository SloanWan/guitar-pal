"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { usePress } from "@/components/ui/press";

/** How long an add shows its tick before it can add again. */
const DONE_MS = 1200;

interface Props {
	/** `add` puts a chord somewhere and ticks; `remove` takes one away. */
	kind: "add" | "remove";
	label: string;
	onClick: () => void;
	className?: string;
}

/**
 * The small square in a chord card's corner: the same size and place on the
 * library's cards (add) and the board's (remove), in its own row above the
 * diagram so it never covers a string. Its hit area is larger than it looks.
 */
export default function CornerButton({ kind, label, onClick, className }: Props) {
	const pressRef = usePress<HTMLButtonElement>();
	const [done, setDone] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current !== null) clearTimeout(timer.current);
		},
		[],
	);

	function press() {
		onClick();
		if (kind !== "add") return;
		setDone(true);
		if (timer.current !== null) clearTimeout(timer.current);
		timer.current = setTimeout(() => setDone(false), DONE_MS);
	}

	const Icon = kind === "remove" ? X : done ? Check : Plus;
	return (
		<button
			ref={pressRef}
			type="button"
			className={`hb-corner gp-focus${className ? ` ${className}` : ""}`}
			data-kind={kind}
			data-done={done ? "" : undefined}
			aria-label={label}
			title={label}
			onClick={press}
		>
			<Icon aria-hidden />
		</button>
	);
}
