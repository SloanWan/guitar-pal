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

/** The practice object: the chord under the hand, the rhythm it is strummed in, the chord coming. */
export default function NowCard({ now, next, children }: Props) {
	return (
		<section className="st-now-card" aria-label="Now playing" data-chords={now ? undefined : "none"}>
			{now && (
				<div className="st-now">
					<div className="st-now-name">
						<span className="st-lab">Now</span>
						<span className="st-chord-big">{now.label}</span>
					</div>
					<ChordDiagram diagram={now.diagram} label={`${now.label} shape`} />
				</div>
			)}
			<div className="st-gridzone">{children}</div>
			{now && next !== null && (
				<div className="st-next">
					<span className="st-lab">Next</span>
					<span className="st-chord-next">{next}</span>
				</div>
			)}
		</section>
	);
}
