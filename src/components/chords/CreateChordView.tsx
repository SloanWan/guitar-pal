"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import Link from "@/components/AppLink";
import ChordShapeFields from "@/components/chords/ChordShapeFields";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useUser } from "@/hooks/useUser";
import {
	chordShapeToVoicing,
	validateChordShape,
	type ChordShape,
	type ShapeFret,
} from "@/lib/chordShape";
import { formatTabSequence, tabSequenceToShape } from "@/lib/chordTabSequence";
import { normalizeChordName } from "@/lib/chordSearch";
import { UNKNOWN_SUFFIX, chordDisplayName } from "@/lib/chordSuffixes";
import { shapeNoteNames, type ChordGuess } from "@/lib/chordIdentify";
import {
	UNKNOWN_CATEGORY,
	browseCategories,
	sameShape,
	userVoicingId,
	type UserChordVoicing,
} from "@/lib/userChordVoicings";
import { chordShapeToVoicing as toVoicing } from "@/lib/chordShape";

/**
 * Writing down a chord the library does not have.
 *
 * Reached only from the shape search, and only when nothing there was held the
 * way the player wrote it — which is why the shape arrives already drawn and the
 * page opens on the two things it still needs: a name to file the chord under,
 * and somewhere to file it.
 */

/** What "filed nowhere in particular" is called in the picker. */
const UNFILED = "Mine";

interface Props {
	/** The shape as it was searched for, low E first. */
	frets: ShapeFret[];
	/** The same shape as the player wrote it, for the line that quotes it back. */
	written: string;
	/** What the library says these notes are called, best first. */
	guesses: ChordGuess[];
}

export default function CreateChordView({ frets, written, guesses }: Props) {
	const { user, loading: userLoading } = useUser();
	const { voicings: userVoicings, saveVoicing } = useUserChordVoicings(user, userLoading);

	const [shape, setShape] = useState<ChordShape>(() => tabSequenceToShape(frets));
	const [chordName, setChordName] = useState("");
	const [shapeName, setShapeName] = useState("");
	const [category, setCategory] = useState<string | null>(null);
	/** The chord once it exists. Null while it is still being written. */
	const [created, setCreated] = useState<UserChordVoicing | null>(null);
	/** Set once this shape has been recognised as one the player already wrote. */
	const [loadedId, setLoadedId] = useState<string | null>(null);

	/**
	 * A chord of the player's own held exactly this way.
	 *
	 * Coming back with the same frets is how a chord gets renamed or refiled
	 * later: there is one door to this page, so it has to be the door back in as
	 * well as the way in.
	 */
	const drawn = toVoicing(tabSequenceToShape(frets), "probe");
	const mine = userVoicings.find((v) => sameShape(v, drawn));

	// Fill the fields from it, once, the first time it turns up — the shapes
	// arrive after the first paint, and re-seeding on every render would undo the
	// player's typing.
	if (mine && loadedId !== mine.id && !created) {
		setLoadedId(mine.id);
		setChordName(chordDisplayName(mine.root, mine.suffix));
		setShapeName(mine.label ?? "");
		setCategory(mine.category ?? null);
	}
	const editing = mine !== undefined && loadedId === mine.id;

	const identity = normalizeChordName(chordName);
	const shapeErrors = validateChordShape(shape).errors;
	const valid = identity !== null && shapeErrors.length === 0;
	/** What the shape sounds — a fact, even when its name is not one. */
	const notes = shapeNoteNames(frets);

	function create() {
		if (!identity || !valid) return;
		const voicing: UserChordVoicing = {
			// Editing keeps the id, so anything already pinned to this shape stays
			// pinned to it rather than being left pointing at a row nobody updated.
			...chordShapeToVoicing(
				shape,
				editing && mine ? mine.id : userVoicingId(crypto.randomUUID()),
				shapeName.trim() || null,
			),
			root: identity.root,
			suffix: identity.suffix,
			...(category ? { category } : {}),
		};
		// Through the same store every other shape goes through: the account when
		// signed in, this device when not.
		setCreated(saveVoicing(voicing));
	}

	/**
	 * Leave it unnamed, honestly.
	 *
	 * Not filed under the note in its bass: that root would be a guess, and it
	 * would bury the chord among the chords of a key it may not belong to. An
	 * unnamed chord belongs to no root at all — it is written down, playable and
	 * findable under Unknown, and can be named the day the player works it out.
	 */
	function nameItUnknown() {
		setChordName(UNKNOWN_SUFFIX);
		setCategory(null);
	}

	/**
	 * Back to the form, which is now editing what was just saved rather than
	 * writing something new — this page is about one shape, and after saving it
	 * that shape is the player's.
	 */
	function keepEditing() {
		setCreated(null);
	}

	if (created) {
		const name = chordDisplayName(created.root, created.suffix);
		return (
			<div className="flex w-full max-w-lg flex-col gap-4 border border-line bg-surface p-5">
				<p className="flex items-center gap-2 text-base font-semibold text-ink">
					<Check size={16} className="shrink-0 text-denim" />
					{name} is yours now.
				</p>
				<p className="text-sm leading-snug text-ink-dim">
					Write it into a progression by name, or find it under{" "}
					<span className="text-ink">
						{created.suffix === UNKNOWN_SUFFIX && !created.category
							? UNKNOWN_CATEGORY
							: (created.category ?? UNFILED)}
					</span>{" "}
					in the chord picker.
				</p>
				{/* The way back in: there is one door to this page, and it is the same
				    six frets. Worth saying, since a chord filed as unknown is one the
				    player fully intends to come back and name. */}
				<p className="text-xs leading-snug text-ink-faint">
					Search{" "}
					<span className="font-mono text-ink-dim">{formatTabSequence(frets)}</span>{" "}
					again any time to rename it or file it somewhere else.
				</p>
				{!user && (
					<p className="text-xs text-ink-faint">
						Saved on this device. Sign in and it moves to your account.
					</p>
				)}
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={keepEditing}
						className="flex h-(--h-control) items-center border border-denim px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent transition-colors hover:bg-denim hover:text-on-denim"
					>
						Keep editing
					</button>
					<Link
						href="/chords"
						className="flex h-(--h-control) items-center border border-line-strong px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors hover:border-denim hover:text-denim-accent"
					>
						Back to chords
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="flex w-full max-w-lg flex-col gap-4 border border-line bg-surface p-5">
			<p className="text-sm leading-snug text-ink-dim">
				{editing ? (
					<>
						You already wrote this one. Rename it, refile it, or redraw it — it keeps
						its place wherever you have used it.
					</>
				) : (
					<>
						Nothing in the library is held like{" "}
						<span className="font-mono tracking-[0.08em] text-ink">{written}</span>. Name
						it and it is yours — searchable, playable, and there next time.
					</>
				)}
			</p>

			{/* What the notes say, before asking the player what they think. Naming a
			    grip you read off a tab is the part they most often cannot do, and it
			    is the part the library can do for them. */}
			{!editing && (
				<div className="flex flex-col gap-2 border border-line bg-raise p-3">
					<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
						{guesses.length === 0
							? "Nothing in the library has these notes"
							: guesses[0].exact
								? "Those notes are"
								: "Nothing has exactly those notes — closest"}
					</span>
					{guesses.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{guesses.map((guess) => {
								const name = chordDisplayName(guess.root, guess.suffix);
								return (
									<button
										key={name}
										type="button"
										onClick={() => setChordName(name)}
										title={`Call it ${name}`}
										className="border border-denim-border bg-denim-tint px-2 py-1 text-[11px] font-semibold text-denim transition-colors hover:bg-denim hover:text-on-denim"
									>
										{name}
									</button>
								);
							})}
						</div>
					)}
					{/* The notes themselves, lowest first. When nothing can be named this
					    is the most useful thing anyone can say, and a player reading it
					    can often finish the identification where the library could not. */}
					{notes.length > 0 && (
						<p className="font-mono text-[11px] tracking-[0.12em] text-ink-dim">
							{notes.join(" ")}
						</p>
					)}
					<button
						type="button"
						onClick={nameItUnknown}
						className="self-start font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim underline-offset-2 transition-colors hover:text-denim-accent hover:underline"
					>
						I don&rsquo;t know what it is — leave it {UNKNOWN_SUFFIX}
					</button>
				</div>
			)}

			<ChordShapeFields
				shape={shape}
				onShapeChange={setShape}
				name={shapeName}
				onNameChange={setShapeName}
				chordName={chordName}
				onChordNameChange={setChordName}
			/>

			<div className="flex flex-col gap-1.5 border-t border-line pt-4">
				<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
					File it under
				</span>
				<div className="flex flex-wrap gap-1.5">
					{[null, ...browseCategories()].map((option) => {
						const on = option === category;
						return (
							<button
								key={option ?? UNFILED}
								type="button"
								onClick={() => setCategory(option)}
								aria-pressed={on}
								className={`border px-2 py-1 text-[11px] font-semibold transition-colors ${
									on
										? "border-denim bg-denim text-on-denim"
										: "border-line-strong text-ink-dim hover:border-denim hover:text-denim"
								}`}
							>
								{option ?? UNFILED}
							</button>
						);
					})}
				</div>
				<p className="text-[10px] leading-snug text-ink-faint">
					Where it sits when you browse the picker by category. {UNFILED} keeps it in
					your own section.
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
				<button
					type="button"
					onClick={create}
					disabled={!valid}
					className="flex h-(--h-control) items-center border border-denim bg-denim px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-on-denim transition-colors hover:bg-denim-dark disabled:cursor-not-allowed disabled:opacity-30"
				>
					{editing ? "Save changes" : "Create chord"}
				</button>
				<Link
					href="/chords"
					className="flex h-(--h-control) items-center px-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors hover:text-denim-accent"
				>
					Cancel
				</Link>
			</div>
		</div>
	);
}
