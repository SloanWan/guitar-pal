"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChordShapeCorpus } from "@/components/chords/useChordShapeMatches";
import { useChordSearchNavigation } from "@/components/chords/useChordSearchNavigation";
import { resolveShapeToChord } from "@/lib/chordShapeSearch";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { chordIndexWithUser, type UserChordVoicing } from "@/lib/userChordVoicings";
import {
	chordAbbreviation,
	hasShapeToken,
	keptTokens,
	parseChordSequence,
	type ChordToken,
	type UnknownChordChoice,
} from "@/lib/strumProgressions";
import { PROGRESSION_PRESETS, filterPresets, groupPresets, type ProgressionPreset } from "@/lib/strumProgressionPresets";

/** Ordered as the arrow keys walk them; keeping comes first, as it throws nothing away. */
const UNKNOWN_ANSWERS = [
	{ key: "keep", label: "Keep as written", hint: "Those bars sound nothing until you give them a shape" },
	{ key: "skip", label: "Skip them", hint: "Leave them out of the progression" },
	{ key: "edit", label: "Keep editing", hint: "Go back to the line and change it" },
] as const;

type UnknownAnswer = (typeof UNKNOWN_ANSWERS)[number]["key"] | "create";

/** Written both ways: the same chord chart is copied on both kinds of keyboard. */
const WRITE_SHORTCUT = "Ctrl/⌘ + Enter";

interface Props {
	onCreate: (tokens: ChordToken[]) => void;
	onCancel: () => void;
	/** The player's own shapes, searchable beside the library's chords. */
	userVoicings: readonly UserChordVoicing[];
}

/**
 * A new progression, typed as a chord line: one bar per chord, by name or by
 * shape. What the line resolves to is read out under it as it is typed; chords
 * the library does not have are asked about rather than guessed at; known
 * progressions narrow as the line grows.
 */
export default function ChordLineComposer({ onCreate, onCancel, userVoicings }: Props) {
	const [line, setLine] = useState("");
	const [error, setError] = useState<string | null>(null);
	// Raised when the line holds chords the library does not have. There is no safe
	// default — dropping loses bars, keeping writes silent ones — so the player answers.
	const [asking, setAsking] = useState(false);
	const [choice, setChoice] = useState(0);
	const answersId = useId();
	const [chordIndex, setChordIndex] = useState<readonly ChordIndexEntry[]>([]);
	// Enter pressed before the chord index arrived: answered as soon as it does.
	const [queued, setQueued] = useState(false);

	useEffect(() => {
		let cancelled = false;
		getChordIndex()
			.then((index) => {
				if (!cancelled) setChordIndex(index);
			})
			.catch((e: unknown) => console.error("[ChordLineComposer] chord index:", e));
		return () => {
			cancelled = true;
		};
	}, []);

	const searchIndex = chordIndexWithUser(chordIndex, userVoicings);
	// Voicings are only fetched once a shape is actually written into the line.
	const shapeCorpus = useChordShapeCorpus(hasShapeToken(line));
	const parsed = parseChordSequence(line, searchIndex, (frets) =>
		shapeCorpus ? resolveShapeToChord(shapeCorpus, frets) : null,
	);
	/** Shapes in the line that nothing is held with — chords waiting to be written. */
	const unwritten = parsed.tokens.filter((t) => t.shape && t.chord === null);
	const { goToCreateChord } = useChordSearchNavigation(onCancel);
	const presets = filterPresets(PROGRESSION_PRESETS, line);
	const answers: { key: UnknownAnswer; label: string; hint: string }[] = unwritten[0]
		? [
				{ key: "create", label: `Write ${unwritten[0].input} down`, hint: "Draw it, name it, and it is yours" },
				...UNKNOWN_ANSWERS,
			]
		: [...UNKNOWN_ANSWERS];

	function submit(answer: UnknownChordChoice | null = null) {
		if (chordIndex.length === 0) {
			setQueued(true);
			return;
		}
		const { tokens, unmatched } = parsed;
		if (tokens.length === 0) {
			setError("Type a chord sequence, e.g. C G Am F");
			return;
		}
		if (unmatched.length > 0 && answer === null) {
			setAsking(true);
			setChoice(0);
			return;
		}
		const kept = keptTokens(tokens, answer ?? "skip");
		if (kept.length === 0) {
			setAsking(false);
			setError(`No chord found for ${unmatched.join(", ")}`);
			return;
		}
		onCreate(kept);
	}

	function answer(key: UnknownAnswer) {
		if (key === "edit") return setAsking(false);
		if (key === "create") {
			if (unwritten[0]) goToCreateChord(unwritten[0].input);
			return;
		}
		submit(key);
	}

	useEffect(() => {
		if (!queued || chordIndex.length === 0) return;
		queueMicrotask(() => {
			setQueued(false);
			submit(null);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps -- fires once, when the index the queued Enter waited for arrives
	}, [queued, chordIndex.length]);

	function applyPreset(preset: ProgressionPreset) {
		setLine(preset.chords);
		setError(null);
		setAsking(false);
	}

	return (
		<div className="st-composer">
			<Input
				autoFocus
				value={line}
				onChange={(e) => {
					setLine(e.target.value);
					if (error) setError(null);
					if (asking) setAsking(false);
				}}
				role={asking ? "combobox" : undefined}
				aria-expanded={asking ? true : undefined}
				aria-controls={asking ? answersId : undefined}
				aria-activedescendant={asking ? `${answersId}-${choice}` : undefined}
				aria-invalid={error ? true : undefined}
				onKeyDown={(e) => {
					if (asking && ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
						e.preventDefault();
						const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
						setChoice((i) => (i + step + answers.length) % answers.length);
					} else if (e.key === "Enter") {
						e.preventDefault();
						if ((e.metaKey || e.ctrlKey) && unwritten[0]) goToCreateChord(unwritten[0].input);
						else if (asking) answer(answers[choice]?.key ?? "edit");
						else submit(null);
					} else if (e.key === "Escape") {
						e.preventDefault();
						onCancel();
					}
				}}
				placeholder="Type chords: Em C G D"
				aria-label="Chord sequence"
			/>
			{parsed.tokens.length > 0 && (
				<div role="status" aria-live="polite" aria-label="What the chord line resolves to" className="st-readout">
					{parsed.tokens.map((token, i) => (
						<span
							key={`${token.input}-${i}`}
							data-bad={token.chord ? undefined : ""}
							title={
								token.chord
									? undefined
									: token.shape
										? `Nothing is held like ${token.input} — ${WRITE_SHORTCUT} writes it down`
										: `${token.input} is not in the library — keep it as a silent bar, or skip it`
							}
						>
							{token.chord ? chordAbbreviation(token.chord) : token.input}
						</span>
					))}
				</div>
			)}
			{error ? (
				<p className="st-lab text-gp-bad">{error}</p>
			) : asking ? (
				<div className="flex flex-col gap-1.5">
					<span className="st-lab text-gp-bad">
						{unwritten.length === parsed.unmatched.length
							? `Nothing is held like ${parsed.unmatched.join(", ")}.`
							: `${parsed.unmatched.join(", ")} not in the chord library.`}
					</span>
					<div id={answersId} role="listbox" aria-label="What to do with the chords that were not found" className="flex flex-wrap gap-1.5">
						{answers.map((a, i) => (
							<button
								key={a.key}
								id={`${answersId}-${i}`}
								type="button"
								role="option"
								aria-selected={i === choice}
								title={a.hint}
								className="st-answer"
								// Keeps focus in the line, so the arrows keep working after a click.
								onMouseDown={(e) => e.preventDefault()}
								onMouseEnter={() => setChoice(i)}
								onClick={() => answer(a.key)}
							>
								{a.label}
							</button>
						))}
					</div>
				</div>
			) : (
				<div className="flex items-center justify-between gap-1.5">
					<span className="st-lab">
						{unwritten[0]
							? `Nothing is held like ${unwritten[0].input} — ${WRITE_SHORTCUT} to write it down.`
							: parsed.tokens.length > 0
								? `${parsed.tokens.length} bar${parsed.tokens.length === 1 ? "" : "s"}`
								: "One chord a bar, by name or shape"}
					</span>
					<span className="flex gap-1">
						<Button variant="ghost" size="xs" onClick={onCancel}>
							Cancel
						</Button>
						<Button size="xs" onClick={() => submit(null)} disabled={parsed.tokens.length === 0} loading={queued}>
							Create
						</Button>
					</span>
				</div>
			)}
			{presets.length > 0 && (
				<div className="st-presets">
					{groupPresets(presets).map(({ group, presets: list }) => (
						<div key={group}>
							<p className="st-presets-group">{group}</p>
							{list.map((preset) => (
								<button
									key={preset.id}
									type="button"
									className="st-preset"
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => applyPreset(preset)}
								>
									<span className="font-semibold">{preset.name}</span>
									<span className="st-lab">{preset.chords}</span>
								</button>
							))}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
