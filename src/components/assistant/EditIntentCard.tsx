"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { EditIntentReading } from "@/lib/strumAssistant/editIntent";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import {
	chordAbbreviation,
	parseChordSequence,
	progressionBarsFromTokens,
} from "@/lib/strumProgressions";
import { stashHandoff } from "@/lib/strumAssistant/handoff";
import { toBars } from "@/lib/strumBars";
import type { NamedPattern } from "@/lib/lastPattern";
import type { StrumPattern } from "@/lib/strumPatterns";

/**
 * What the assistant understood, before anything is written.
 *
 * An edit is a sentence, not a grid, so it gets a line to check rather than the
 * preview card a new pattern gets. Two ways out: it is right, or it is nearly
 * right — and "nearly right" is the common one, which is why correcting it is a
 * button and not a retyped sentence.
 */

const STRUM_PATH = "/strum";

/**
 * A chord line in the spellings the library uses.
 *
 * `c am f g` is how chords are typed and `C Am F G` is what they are, so the
 * field says the latter: seeing `d#` come back as `Eb` is how the player knows
 * it was understood, and knows which of the two the app will write. A word the
 * library cannot place keeps its own spelling — there is nothing to correct it
 * to, and rewriting it would only hide that it did not resolve.
 */
function canonicalLine(line: string, index: readonly ChordIndexEntry[]): string {
	const { tokens } = parseChordSequence(line, index);
	return tokens.map((token) => (token.chord ? chordAbbreviation(token.chord) : token.input)).join(" ");
}

export default function EditIntentCard({
	edit,
	patterns,
	index,
}: {
	edit: EditIntentReading;
	/** Everything a name could refer to, for the picker in edit mode. */
	patterns: readonly StrumPattern[];
	index: readonly ChordIndexEntry[];
}) {
	const router = useRouter();
	const pathname = usePathname();

	// Which pattern this will be written to, and the chord line to write. Both
	// start as they were read and are what the fields edit.
	const [target, setTarget] = useState<NamedPattern | null>(
		edit.kind === "attach" ? edit.pattern : null,
	);
	const [chordLine, setChordLine] = useState(() =>
		edit.kind === "ambiguous" ? "" : canonicalLine(edit.chordWords.join(" "), index),
	);
	const [editing, setEditing] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);

	/**
	 * Whether every part of the request came through. A half-read one is not put
	 * in front of the player as a form to correct — the message says what was
	 * read and what was not, and the fields open only if they want them. Guessing
	 * that someone wants to type is still a guess.
	 */
	const complete = edit.kind === "attach" && edit.chordWords.length > 0;
	const [offered, setOffered] = useState(!complete);
	const [dismissed, setDismissed] = useState(false);

	// Resolved live, so a correction is judged the moment it is typed.
	const parsed = parseChordSequence(chordLine, index);
	const pattern = patterns.find((p) => p.id === target?.id) ?? null;

	/**
	 * Write it, and hand it to the strum page to save and open.
	 *
	 * Everything that can be checked is checked here, where the player is still
	 * looking at the panel — the page it lands on has no way to argue back.
	 */
	function confirm() {
		if (!pattern) {
			setError("Pick a pattern to add this to.");
			return;
		}
		if (parsed.tokens.length === 0) {
			setError("Write at least one chord.");
			return;
		}
		if (parsed.chords.length === 0) {
			setError("None of those match a chord in the library.");
			return;
		}
		const bars = progressionBarsFromTokens(toBars(pattern)[0].beats, parsed.tokens);
		if (bars.length === 0) {
			setError("That leaves nothing to save.");
			return;
		}
		setError(null);
		setDone(true);
		stashHandoff({
			kind: "attach",
			patternId: pattern.id,
			patternName: pattern.name,
			bars,
		});
		if (pathname !== STRUM_PATH) router.push(STRUM_PATH);
	}

	if (dismissed) return null;

	// The offer, for a request only half of which was read. One button to take
	// it over, one to let it go — and the message above has already said exactly
	// what was understood, so there is nothing to repeat here.
	if (offered && edit.kind !== "ambiguous") {
		return (
			<Card>
				<div className="flex items-center justify-end gap-2 px-2 py-2">
					<button
						type="button"
						onClick={() => setDismissed(true)}
						className="flex items-center gap-1 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors duration-(--dur-hover) hover:text-ink focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
					>
						<X className="size-3" strokeWidth={1.5} aria-hidden="true" />
						Not now
					</button>
					<button
						type="button"
						onClick={() => {
							setOffered(false);
							setEditing(true);
						}}
						className="flex items-center gap-1 border border-denim px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent transition-colors duration-(--dur-hover) hover:bg-denim hover:text-on-denim focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
					>
						<Pencil className="size-3" strokeWidth={1.5} aria-hidden="true" />
						Fill it in
					</button>
				</div>
			</Card>
		);
	}

	if (edit.kind === "ambiguous" && target === null) {
		return (
			<Card>
				<Row label="Pattern">
					<div className="flex flex-wrap gap-1.5">
						{edit.matches.map((match) => (
							<button
								key={match.id}
								type="button"
								onClick={() => setTarget(match)}
								className="border border-line-strong px-2 py-1 font-mono text-[11px] text-ink-dim transition-[color,border-color] duration-(--dur-hover) hover:border-denim hover:text-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
							>
								{match.name}
							</button>
						))}
					</div>
				</Row>
			</Card>
		);
	}

	if (done) {
		return (
			<Card>
				<p className="flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent">
					<Check className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
					Added to {pattern?.name}
				</p>
			</Card>
		);
	}

	return (
		<Card>
			<Row label="Add to">
				{editing ? (
					<select
						value={target?.id ?? ""}
						onChange={(e) => {
							const next = patterns.find((p) => p.id === e.target.value) ?? null;
							setTarget(next ? { id: next.id, name: next.name } : null);
						}}
						aria-label="Pattern to add the chords to"
						className="w-full border border-line-strong bg-panel px-2 py-1 font-mono text-xs text-ink focus-visible:border-denim focus-visible:outline-none"
					>
						<option value="">Pick a pattern…</option>
						{patterns.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				) : (
					<span className="font-mono text-xs text-ink">{target?.name}</span>
				)}
			</Row>

			<Row label="Chords">
				{editing ? (
					<input
						type="text"
						autoFocus={chordLine === ""}
						value={chordLine}
						onChange={(e) => setChordLine(e.target.value)}
						onKeyDown={(e) => {
							// The panel's own form is one Enter away; this field keeps its own.
							if (e.key !== "Enter") return;
							e.preventDefault();
							e.stopPropagation();
							confirm();
						}}
						onBlur={() => setChordLine((line) => canonicalLine(line, index))}
						aria-label="Chords to add, in order"
						spellCheck={false}
						className="w-full border border-line-strong bg-panel px-2 py-1 font-mono text-xs tracking-[0.08em] text-ink focus-visible:border-denim focus-visible:outline-none"
					/>
				) : (
					<span className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-xs">
						{parsed.tokens.length === 0 && (
							<span className="text-ink-faint">not said — write them here</span>
						)}
						{parsed.tokens.map((token, i) => (
							<span
								key={`${token.input}-${i}`}
								// Shown as the library spells it, not as it was typed: "d#"
								// coming back as "Eb" is how you see it was understood. A word
								// the library cannot place keeps the player's own spelling and
								// is shown, not dropped — it would be saved as a bar that holds
								// its time and sounds nothing until a shape is drawn for it.
								className={token.chord ? "text-ink" : "text-destructive"}
								title={token.chord ? undefined : `${token.input} — not in the chord library`}
							>
								{token.chord ? chordAbbreviation(token.chord) : token.input}
							</span>
						))}
					</span>
				)}
			</Row>

			{parsed.unmatched.length > 0 && !editing && (
				<p className="px-3 pb-2 text-[11px] leading-snug text-destructive">
					{parsed.unmatched.join(", ")} {parsed.unmatched.length === 1 ? "is" : "are"} not in
					the chord library — those bars will keep their place and sound nothing.
				</p>
			)}

			{error && <p className="px-3 pb-2 text-[11px] leading-snug text-destructive">{error}</p>}

			<div className="flex items-center justify-end gap-2 border-t border-line px-2 py-2">
				{editing ? (
					<>
						<button
							type="button"
							onClick={() => setEditing(false)}
							className="flex items-center gap-1 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors duration-(--dur-hover) hover:text-ink focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
						>
							<X className="size-3" strokeWidth={1.5} aria-hidden="true" />
							Cancel
						</button>
						<button
							type="button"
							onClick={confirm}
							className="flex items-center gap-1 border border-denim bg-denim px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-on-denim transition-colors duration-(--dur-hover) hover:bg-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
						>
							<Check className="size-3" strokeWidth={1.5} aria-hidden="true" />
							Submit
						</button>
					</>
				) : (
					<>
						<button
							type="button"
							onClick={() => setEditing(true)}
							className="flex items-center gap-1 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors duration-(--dur-hover) hover:text-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
						>
							<Pencil className="size-3" strokeWidth={1.5} aria-hidden="true" />
							Edit
						</button>
						<button
							type="button"
							onClick={confirm}
							className="flex items-center gap-1 border border-denim bg-denim px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-on-denim transition-colors duration-(--dur-hover) hover:bg-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
						>
							<Check className="size-3" strokeWidth={1.5} aria-hidden="true" />
							Confirm
						</button>
					</>
				)}
			</div>
		</Card>
	);
}

function Card({ children }: { children: React.ReactNode }) {
	return (
		<div className="mt-2 w-full border border-denim bg-surface animate-[proposal-pop_0.18s_ease-out] motion-reduce:animate-none">
			{children}
		</div>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-baseline gap-2 px-3 py-2">
			<span className="w-14 shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
				{label}
			</span>
			<span className="min-w-0 flex-1">{children}</span>
		</div>
	);
}
