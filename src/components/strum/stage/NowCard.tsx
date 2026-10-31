"use client";

import type { ReactNode } from "react";
import type { BarChordDiagram } from "@/components/strum/useBarChordDiagrams";
import ChordDiagram from "./ChordDiagram";

interface Props {
	/** What sounds now and next, as written on a chart; null when no sequence is open. */
	now: { label: string; diagram: BarChordDiagram | null } | null;
	next: string | null;
	/** The pulse and the rhythm grid. */
	children: ReactNode;
}

/** A chord name's length class: long names step the type down rather than widen the column. */
function lengthClass(label: string): string | undefined {
	if (label.length > 5) return "xl";
	if (label.length > 3) return "l";
	return undefined;
}

/**
 * The practice object: the chord under the hand, the rhythm it is strummed in, the
 * chord coming. The two chord columns keep one width whatever they hold — a dash,
 * "C" or "Gmaj7#11" — so the grid between them never moves.
 */
export default function NowCard({ now, next, children }: Props) {
	const label = now?.label ?? "—";
	return (
		<section className="st-now-card" aria-label="Now playing">
			<div className="st-now" data-empty={now ? undefined : ""}>
				<div className="st-now-name">
					<span className="st-lab">Now</span>
					<span className="st-chord-big" data-len={lengthClass(label)} title={label}>
						{label}
					</span>
				</div>
				<ChordDiagram diagram={now?.diagram ?? null} label={now ? `${now.label} shape` : undefined} />
			</div>
			<div className="st-gridzone">{children}</div>
			<div className="st-next" data-empty={next === null ? "" : undefined}>
				<span className="st-lab">Next</span>
				<span className="st-chord-next" title={next ?? undefined}>
					{next ?? "—"}
				</span>
			</div>
		</section>
	);
}
