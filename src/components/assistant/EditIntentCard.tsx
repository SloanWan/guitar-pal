"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { EditIntentReading, EditOp } from "@/lib/strumAssistant/editIntent";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import {
	chordAbbreviation,
	parseChordSequence,
	progressionBarsFromTokens,
} from "@/lib/strumProgressions";
import { patternHandoff, stashHandoff } from "@/lib/strumAssistant/handoff";
import { buildProposal } from "@/lib/strumAssistant/buildProposal";
import { isPreset } from "@/lib/strumAssistant/turn";
import { patternNameTakenBy, toBars } from "@/lib/strumBars";
import type { NamedPattern } from "@/lib/lastPattern";
import type { StrumPattern } from "@/lib/strumPatterns";

/**
 * What the assistant understood, before anything is written.
 *
 * An edit is a sentence, not a grid, so it gets a line to check rather than the
 * preview card a new pattern gets. Two ways out: it is right, or it is nearly
 * right — and "nearly right" is the common one, which is why correcting it is a
 * button and not a retyped sentence.
 *
 * Three operations share this: chords onto a pattern, a new name for one, and
 * taking one away. Presets take the first and refuse the other two.
 *
 * A card is for something to look at — a preview to confirm, fields to edit. A
 * question gets answers, not a card: they arrive one after another under the
 * message, the way the examples do, and the card appears only once there is
 * something to show.
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
	ensureIndex,
	done,
	onDone,
}: {
	edit: EditIntentReading;
	/** Everything a name could refer to, for the picker in edit mode. */
	patterns: readonly StrumPattern[];
	index: readonly ChordIndexEntry[];
	/** Asks for the index when this card finds itself rendering without one. */
	ensureIndex: () => void;
	/** Confirmed already — kept on the message, so it survives the panel closing. */
	done: boolean;
	onDone: () => void;
}) {
	const router = useRouter();
	const pathname = usePathname();

	// Nothing can be judged against an index that has not arrived. A restored
	// card asks for it rather than calling every chord unplaceable meanwhile.
	const indexReady = index.length > 0;
	useEffect(() => {
		if (!indexReady) ensureIndex();
	}, [indexReady, ensureIndex]);

	const op: EditOp = edit.op;

	// What this will be written to, and what will be written. Both start as they
	// were read and are what the fields edit.
	const [target, setTarget] = useState<NamedPattern | null>(
		edit.kind === "attach" || edit.kind === "rename" || edit.kind === "delete" ? edit.pattern : null,
	);
	const [chordLine, setChordLine] = useState(() =>
		edit.kind === "attach" || edit.kind === "unknown-pattern" ? edit.chordWords.join(" ") : "",
	);
	const [newName, setNewName] = useState(edit.kind === "rename" ? edit.newName : "");
	const [editing, setEditing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	/**
	 * Whether every part of the request came through. A half-read one is not put
	 * in front of the player as a form to correct — the message says what was
	 * read and what was not, and the fields open only if they want them. Guessing
	 * that someone wants to type is still a guess.
	 */
	const complete =
		(edit.kind === "attach" && edit.chordWords.length > 0) ||
		(edit.kind === "rename" && edit.newName !== "") ||
		edit.kind === "delete";
	const [offered, setOffered] = useState(!complete);
	const [dismissed, setDismissed] = useState(false);
	/** Written after confirming: what the card says it did. */
	const [outcome, setOutcome] = useState<string | null>(null);

	// Resolved live, so a correction is judged the moment it is typed.
	const parsed = parseChordSequence(chordLine, index);
	const pattern = patterns.find((p) => p.id === target?.id) ?? null;
	const preset = pattern !== null && isPreset(pattern.id);

	function openFields() {
		setOffered(false);
		setChordLine((line) => canonicalLine(line, index));
		setEditing(true);
	}

	function leave() {
		if (pathname !== STRUM_PATH) router.push(STRUM_PATH);
	}

	/**
	 * Write it, and hand it to the strum page to save and open.
	 *
	 * Everything that can be checked is checked here, where the player is still
	 * looking at the panel — the page it lands on has no way to argue back.
	 */
	function confirm() {
		if (!pattern) return setError("Pick a pattern.");

		if (op === "attach") {
			if (parsed.tokens.length === 0) return setError("Write at least one chord.");
			if (parsed.chords.length === 0) return setError("None of those match a chord in the library.");
			const bars = progressionBarsFromTokens(toBars(pattern)[0].beats, parsed.tokens);
			if (bars.length === 0) return setError("That leaves nothing to save.");
			stashHandoff({ kind: "attach", patternId: pattern.id, patternName: pattern.name, bars });
			setOutcome(`Added to ${pattern.name}`);
		} else if (op === "rename") {
			if (preset) return setError("Shipped patterns keep their names.");
			const name = newName.trim();
			if (name === "") return setError("Write the new name.");
			const taken = patternNameTakenBy(name, patterns, pattern.id);
			if (taken) return setError(`"${taken.name}" is already a pattern.`);
			stashHandoff({ kind: "rename", patternId: pattern.id, patternName: pattern.name, newName: name });
			setOutcome(`Renamed to ${name}`);
		} else {
			if (preset) return setError("Shipped patterns cannot be deleted.");
			stashHandoff({ kind: "delete", patternId: pattern.id, patternName: pattern.name });
			setOutcome(`Deleted ${pattern.name}`);
		}
		setError(null);
		onDone();
		leave();
	}

	/**
	 * The chords were fine; only the pattern was missing. Make it — the way a
	 * proposal is made: the chords over the default rhythm, flagged as guessed,
	 * saved as a pattern plus one progression, and opened.
	 */
	function createNamed() {
		if (edit.kind !== "unknown-pattern") return;
		const built = buildProposal({
			chordWords: parsed.tokens.map((t) => t.input),
			name: edit.name,
			index,
		});
		if (!built.ok || built.proposal.chords.length === 0) {
			setError("None of those match a chord in the library.");
			return;
		}
		stashHandoff(patternHandoff(built.proposal));
		setOutcome(`Made "${edit.name}"`);
		onDone();
		leave();
	}

	if (dismissed) return null;

	if (done) {
		return (
			<p className="flex items-center gap-1.5 pl-2 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent">
				<Check className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
				{outcome ?? "Done"}
			</p>
		);
	}

	// A preset can take chords and nothing else; the message has said so. So has
	// it for a progression the player wanted gone — that is not a delete here.
	if (preset && op !== "attach") return null;
	if (edit.kind === "delete" && edit.aboutProgression) return null;

	if (edit.kind === "ambiguous" && target === null) {
		return (
			<Options>
				{edit.matches.map((match, i) => (
					<Option key={match.id} order={i} tone="outline" onClick={() => setTarget(match)}>
						{match.name}
					</Option>
				))}
			</Options>
		);
	}

	// The offer, for a request only half of which was read. The message above
	// has already said exactly what was understood, so nothing is repeated here
	// — only the ways forward. A missing pattern with good chords has one more:
	// make it.
	if (offered) {
		const canCreate = edit.kind === "unknown-pattern" && edit.op === "attach" && parsed.chords.length > 0;
		return (
			<>
				<Options>
					{canCreate && edit.kind === "unknown-pattern" && (
						<Option order={0} tone="outline" onClick={createNamed} icon={<Plus className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
							Make “{edit.name}”
						</Option>
					)}
					<Option order={canCreate ? 1 : 0} tone="outline" onClick={openFields} icon={<Pencil className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
						{edit.kind === "unknown-pattern" ? "Pick one" : "Fill it in"}
					</Option>
					<Option order={canCreate ? 2 : 1} tone="ghost" onClick={() => setDismissed(true)} icon={<X className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
						Not now
					</Option>
				</Options>
				{error && <Problem>{error}</Problem>}
			</>
		);
	}

	// Yes or no to a deletion — the message has already said what goes with it.
	if (op === "delete") {
		return (
			<>
				<Options>
					<Option order={0} tone="ghost" onClick={() => setDismissed(true)} icon={<X className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
						Keep it
					</Option>
					<Option order={1} tone="danger" onClick={confirm} icon={<Trash2 className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
						Delete
					</Option>
				</Options>
				{error && <Problem>{error}</Problem>}
			</>
		);
	}

	return (
		<Card>
			<Row label={op === "attach" ? "Add to" : "Rename"}>
				{editing ? (
					<select
						value={target?.id ?? ""}
						onChange={(e) => {
							const next = patterns.find((p) => p.id === e.target.value) ?? null;
							setTarget(next ? { id: next.id, name: next.name } : null);
						}}
						aria-label={op === "attach" ? "Pattern to add the chords to" : "Pattern to rename"}
						className="w-full border border-line-strong bg-panel px-2 py-1 font-mono text-xs text-ink focus-visible:border-denim focus-visible:outline-none"
					>
						<option value="">Pick a pattern…</option>
						{patterns
							.filter((p) => op === "attach" || !isPreset(p.id))
							.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
					</select>
				) : (
					<span className="font-mono text-xs text-ink">{target?.name}</span>
				)}
			</Row>

			{op === "attach" && (
				<Row label="Chords">
					{editing ? (
						<input
							type="text"
							autoFocus={chordLine === ""}
							value={chordLine}
							onChange={(e) => setChordLine(e.target.value)}
							onKeyDown={(e) => submitOnEnter(e, confirm)}
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
									className={token.chord || !indexReady ? "text-ink" : "text-destructive"}
									title={
										token.chord || !indexReady ? undefined : `${token.input} — not in the chord library`
									}
								>
									{token.chord ? chordAbbreviation(token.chord) : token.input}
								</span>
							))}
						</span>
					)}
				</Row>
			)}

			{op === "rename" && (
				<Row label="To">
					{editing ? (
						<input
							type="text"
							autoFocus={newName === ""}
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							onKeyDown={(e) => submitOnEnter(e, confirm)}
							aria-label="New name"
							maxLength={60}
							className="w-full border border-line-strong bg-panel px-2 py-1 font-mono text-xs text-ink focus-visible:border-denim focus-visible:outline-none"
						/>
					) : (
						<span className="font-mono text-xs text-ink">{newName}</span>
					)}
				</Row>
			)}

			{op === "attach" && indexReady && parsed.unmatched.length > 0 && !editing && (
				<Problem>
					{parsed.unmatched.join(", ")} {parsed.unmatched.length === 1 ? "is" : "are"} not in
					the chord library — those bars will keep their place and sound nothing.
				</Problem>
			)}

			{error && <Problem>{error}</Problem>}

			<div className="flex items-center justify-end gap-2 border-t border-line px-2 py-2">
				{editing ? (
					<>
						<GhostButton onClick={() => setEditing(false)} icon={<X className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
							Cancel
						</GhostButton>
						<FillButton onClick={confirm} icon={<Check className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
							Submit
						</FillButton>
					</>
				) : (
					<>
						<GhostButton onClick={openFields} icon={<Pencil className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
							Edit
						</GhostButton>
						<FillButton onClick={confirm} icon={<Check className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
							Confirm
						</FillButton>
					</>
				)}
			</div>
		</Card>
	);
}

/** Enter submits the field it is in; the panel's own form is one Enter away. */
function submitOnEnter(e: React.KeyboardEvent, submit: () => void) {
	if (e.key !== "Enter") return;
	e.preventDefault();
	e.stopPropagation();
	submit();
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

function Problem({ children }: { children: React.ReactNode }) {
	return <p className="px-3 pb-2 text-[11px] leading-snug text-destructive">{children}</p>;
}

const BUTTON =
	"flex items-center gap-1 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-(--dur-hover) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1";

interface ButtonProps {
	onClick: () => void;
	icon: React.ReactNode;
	children: React.ReactNode;
}

function GhostButton({ onClick, icon, children }: ButtonProps) {
	return (
		<button type="button" onClick={onClick} className={`${BUTTON} text-ink-dim hover:text-ink`}>
			{icon}
			{children}
		</button>
	);
}

function FillButton({ onClick, icon, children }: ButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`${BUTTON} border border-denim bg-denim text-on-denim hover:bg-denim-accent`}
		>
			{icon}
			{children}
		</button>
	);
}

/** Answers to a question, under the message that asked it. */
function Options({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-wrap items-center gap-1.5 pl-2">{children}</div>;
}

const TONES = {
	ghost: "text-ink-dim hover:text-ink",
	outline: "border border-denim text-denim-accent hover:bg-denim hover:text-on-denim",
	fill: "border border-denim bg-denim text-on-denim hover:bg-denim-accent",
	// The one tone that throws work away.
	danger: "border border-destructive bg-destructive text-white hover:bg-destructive/90",
} as const;

/**
 * One answer. Each lands a beat after the one before it — the same arrival the
 * examples make — with backwards fill so it is not there until its turn.
 */
function Option({
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
			className={`${BUTTON} ${TONES[tone]} animate-[proposal-pop_0.35s_ease-out_backwards] motion-reduce:animate-none`}
			style={{ animationDelay: `${order * 0.14}s` }}
		>
			{icon}
			{children}
		</button>
	);
}
