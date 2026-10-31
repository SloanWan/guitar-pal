"use client";

import { useState } from "react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { slotHasStringData } from "@/lib/fingerpickEdit";
import { applyPickSequence, parsePickSequence, pickPlaceholder, type PickSequenceParse } from "@/lib/fingerpickPickSequence";
import { selectRefVoicing } from "@/lib/strumBars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";
import type { ChordTools } from "./useChordTools";

interface Props {
	working: FingerpickPattern;
	commit: CommitPattern;
	measureIndex: number;
	tools: Pick<ChordTools, "chordsInEffect" | "voicingsFor">;
	/** In a bar's footer: the label on the field's row, not a heading. */
	inline?: boolean;
}

type Parsed = Extract<PickSequenceParse, { ok: true }>;

/**
 * A right-hand sequence typed for the bar (#361): string numbers (1 = high e …
 * 6 = low E), strings plucked together in brackets, 0 or - a rest, _ or ^ holding
 * the note before; written over the bar, fretted from the chord in effect at
 * each beat. A bar with notes asks first; what could not be written as asked is
 * said after. Shapes still loading stop it rather than writing open strings.
 * The inspector's Bar section and every bar's footer write through it.
 */
export default function InspectorPick({ working, commit, measureIndex, tools, inline = false }: Props) {
	const [text, setText] = useState("");
	const [notice, setNotice] = useState<{ kind: "error" | "warning"; lines: readonly string[] } | null>(null);
	const [ask, setAsk] = useState<Parsed | null>(null);
	const measure = working.measures[measureIndex];

	function write(parsed: Parsed) {
		const result = applyPickSequence(working, measureIndex, parsed, (ref) => {
			const state = tools.voicingsFor(ref);
			return state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
		});
		commit(() => result.pattern);
		setAsk(null);
		setNotice(result.warnings.length > 0 ? { kind: "warning", lines: result.warnings } : null);
	}

	function request() {
		const parsed = parsePickSequence(text, working.timeSignature);
		if (!parsed.ok) {
			setNotice({ kind: "error", lines: [parsed.error] });
			return;
		}
		const loading = (tools.chordsInEffect[measureIndex] ?? []).some(
			(ref) => ref !== null && tools.voicingsFor(ref).status === "loading",
		);
		if (loading) {
			setNotice({ kind: "error", lines: ["Chord shapes are still loading — try again in a moment."] });
			return;
		}
		if (measure?.slots.some(slotHasStringData)) setAsk(parsed);
		else write(parsed);
	}

	return (
		<>
			{!inline && (
				<h3>
					Pick sequence <span className="pb-lab">strings, from the chord&apos;s shape</span>
				</h3>
			)}
			<div className="te-irow te-nowrap">
				{inline && <span className="te-mb-lab">Pick</span>}
				<Input
					className="te-mono"
					value={text}
					placeholder={pickPlaceholder(working.timeSignature)}
					aria-label={`Pick sequence for bar ${measureIndex + 1}`}
					title="String numbers, 1 = high e … 6 = low E. Brackets pluck strings together; 0 or - is a rest; _ or ^ holds the note before. Enter writes the bar, fretted from its chord."
					onChange={(e) => {
						setText(e.target.value);
						setNotice(null);
						setAsk(null);
					}}
					onKeyDown={(e) => {
						// The tab's keys stay out of the field.
						e.stopPropagation();
						if (e.key !== "Enter") return;
						e.preventDefault();
						request();
					}}
				/>
				<Button size="xs" variant="secondary" disabled={!text.trim()} onClick={request}>
					Write
				</Button>
			</div>
			{notice && (
				<ul className="te-notes" data-kind={notice.kind}>
					{notice.lines.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
			)}
			{ask && (
				<div className="te-ask" role="alertdialog" aria-label="Overwrite the bar">
					<span>Bar {measureIndex + 1} has notes. Write the sequence over them?</span>
					<div className="te-ask-row">
						<Button size="xs" onClick={() => write(ask)}>
							Overwrite
						</Button>
						<Button size="xs" variant="ghost" onClick={() => setAsk(null)}>
							Cancel
						</Button>
					</div>
				</div>
			)}
		</>
	);
}
