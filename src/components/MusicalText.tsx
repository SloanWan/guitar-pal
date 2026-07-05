"use client";

import { Fragment } from "react";
import { parseMusicalText } from "@/lib/musicalNotation";

// Default font stack switches symbol spans away from Geist (which lacks
// ♭/♯ glyphs) to system-ui, which covers them on all major platforms.
const DEFAULT_SYMBOL_CLASS = "font-[system-ui] translate-y-[0.05em] inline-block";

interface Props {
	text: string;
	className?: string;
	symbolClassName?: string;
}

export default function MusicalText({ text, className, symbolClassName }: Props) {
	const segments = parseMusicalText(text);
	const symClass = symbolClassName ?? DEFAULT_SYMBOL_CLASS;

	return (
		<span className={className}>
			{segments.map((seg, i) =>
				seg.type === "symbol" ? (
					<span key={i} className={symClass}>
						{seg.value}
					</span>
				) : (
					<Fragment key={i}>{seg.value}</Fragment>
				),
			)}
		</span>
	);
}
