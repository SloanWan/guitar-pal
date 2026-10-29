"use client";

import { Library, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import RhythmGrid, { type RhythmPosition } from "@/components/strum/stage/RhythmGrid";
import type { Bar, Beat, StrumPattern } from "@/lib/strumPatterns";
import type { Meter } from "@/lib/strumMeter";
import { barLabel } from "@/lib/strumProgressions";

interface Props {
	bars: readonly Bar[];
	capo: number | null;
	/** The pattern picked for them; null until the player picks one. */
	pattern: StrumPattern | null;
	meta: string;
	rhythm: Beat[][];
	meter: Meter;
	position: RhythmPosition | null;
	/** Below the desktop width the list is in a sheet: this opens it. */
	onOpenLibrary: () => void;
	onNewPattern: () => void;
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * Chords brought from the Chords board, waiting for a pattern. The page shows
 * this in place of the stage: nothing is saved until a pattern is picked (or
 * written) and the player adds them.
 */
export default function PendingChords({
	bars,
	capo,
	pattern,
	meta,
	rhythm,
	meter,
	position,
	onOpenLibrary,
	onNewPattern,
	onConfirm,
	onCancel,
}: Props) {
	return (
		<section className="st-pending" aria-label="New progression">
			<div className="st-title">
				<span className="st-lab">{pattern ? "A new progression from Chords, on" : "A new progression from Chords"}</span>
				{/* A pattern's name is capitalised like every pattern title; the question is a sentence. */}
				<h1 data-sentence={pattern ? undefined : ""}>{pattern ? pattern.name : "Choose a pattern"}</h1>
			</div>
			<div className="st-pending-chords">
				<ol aria-label="Chords">
					{bars.map((bar, i) => (
						<li key={i}>{barLabel(bar)}</li>
					))}
				</ol>
				{capo !== null && <span className="st-lab">Capo {capo}</span>}
			</div>
			<div className="st-pending-rhythm">
				{pattern ? (
					<>
						<div className="st-pending-meta">
							<span className="st-lab">{meta}</span>
							<Button variant="ghost" size="xs" className="st-libbtn" onClick={onOpenLibrary}>
								<Library aria-hidden />
								Another pattern
							</Button>
						</div>
						<div className="st-gridzone">
							<RhythmGrid rhythm={rhythm} meter={meter} position={position} />
						</div>
					</>
				) : (
					<div className="st-pending-empty">
						<p>Pick the rhythm these chords are strummed to from the patterns, or write a new one.</p>
						<div className="st-pending-picks">
							<Button variant="secondary" size="sm" className="st-libbtn" onClick={onOpenLibrary}>
								<Library aria-hidden />
								Patterns
							</Button>
							<Button variant="secondary" size="sm" onClick={onNewPattern}>
								<Plus aria-hidden />
								New pattern
							</Button>
						</div>
					</div>
				)}
			</div>
			<div className="st-pending-actions">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				<Button size="sm" disabled={pattern === null} onClick={onConfirm}>
					Add the progression
				</Button>
			</div>
		</section>
	);
}
