"use client";

import "./create.css";
import { useState } from "react";
import { ChevronLeft, Play } from "lucide-react";
import Link from "@/components/AppLink";
import ChordShapeEditor from "@/components/chords/ChordShapeEditor";
import { useChordPreview } from "@/components/chords/useChordPreview";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input } from "@/components/ui/input";
import { Pick } from "@/components/ui/pick";
import { useUser } from "@/hooks/useUser";
import { chordShapeToVoicing, validateChordShape, type ChordShape, type ShapeFret } from "@/lib/chordShape";
import { formatTabSequence, tabSequenceToShape } from "@/lib/chordTabSequence";
import { normalizeChordName } from "@/lib/chordSearch";
import { withGlyphs } from "@/lib/chordFormulas";
import { chordHref } from "@/lib/chordSlug";
import { chordDisplayName, chordSymbol, isUnknownSuffix, unknownSuffixFor } from "@/lib/chordSuffixes";
import { shapeNoteNames, type ChordGuess } from "@/lib/chordIdentify";
import { voicingPitches } from "@/lib/chordVoicingToMidi";
import { UNKNOWN_CATEGORY, browseCategories, sameShape, userVoicingId, type UserChordVoicing } from "@/lib/userChordVoicings";

/**
 * Writing down a chord the library does not have.
 *
 * Reached from the shape search when nothing is held the way the player wrote
 * it, so the shape arrives drawn and the page asks for the two things it still
 * needs: a name to file the chord under, and somewhere to file it.
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
	const preview = useChordPreview();

	const [shape, setShape] = useState<ChordShape>(() => tabSequenceToShape(frets));
	const [chordName, setChordName] = useState("");
	const [shapeName, setShapeName] = useState("");
	const [category, setCategory] = useState<string | null>(null);
	/** The chord once it exists. Null while it is still being written. */
	const [created, setCreated] = useState<UserChordVoicing | null>(null);
	/** Set once this shape has been recognised as one the player already wrote. */
	const [loadedId, setLoadedId] = useState<string | null>(null);

	// Coming back with the same frets is how a chord of one's own is renamed or
	// refiled: this page's one door is also the way back in.
	const drawn = chordShapeToVoicing(tabSequenceToShape(frets), "probe");
	const mine = userVoicings.find((v) => sameShape(v, drawn));

	// Seeded once, when the player's shapes arrive after the first paint; seeding
	// on every render would undo their typing.
	if (mine && loadedId !== mine.id && !created) {
		setLoadedId(mine.id);
		setChordName(chordDisplayName(mine.root, mine.suffix));
		setShapeName(mine.label ?? "");
		setCategory(mine.category ?? null);
	}
	const editing = mine !== undefined && loadedId === mine.id;

	const identity = normalizeChordName(chordName);
	const valid = identity !== null && validateChordShape(shape).ok;
	/** What the shape sounds — a fact, even when its name is not one. */
	const notes = shapeNoteNames(frets);
	const unknownName = unknownSuffixFor(formatTabSequence(frets));

	function create() {
		if (!identity || !valid) return;
		// Editing keeps the id, so anything pinned to this shape stays pinned to it.
		const voicing: UserChordVoicing = {
			...chordShapeToVoicing(shape, editing && mine ? mine.id : userVoicingId(crypto.randomUUID()), shapeName.trim() || null),
			root: identity.root,
			suffix: identity.suffix,
			...(category ? { category } : {}),
		};
		setCreated(saveVoicing(voicing));
	}

	/**
	 * Leave it unnamed, honestly, and named after its grip: `uk-007707`. Not filed
	 * under the note in its bass, which would be a guess; the frets are what tells
	 * two unnamed chords apart.
	 */
	function nameItUnknown() {
		setChordName(unknownName);
		setCategory(null);
	}

	const header = (title: string, lead: React.ReactNode) => (
		<header className="wr-head">
			<Button asChild variant="ghost" size="xs" className="wr-back">
				<Link href="/chords">
					<ChevronLeft aria-hidden />
					Chords
				</Link>
			</Button>
			<h1>{title}</h1>
			<p className="wr-lead">{lead}</p>
		</header>
	);

	if (created) {
		const name = withGlyphs(chordSymbol(created.root, created.suffix));
		return (
			<div className="wr-page">
				<div className="wr-in">
					<section className="wr-done" aria-label="Saved">
						<p className="wr-done-title">
							<Pick className="wr-done-pick" />
							{name} is yours now.
						</p>
						<p className="wr-lead">
							Write it into a progression by name, or find it under{" "}
							<b>{isUnknownSuffix(created.suffix) && !created.category ? UNKNOWN_CATEGORY : (created.category ?? UNFILED)}</b> in the
							chord picker.
						</p>
						{/* The way back in is the same six frets — worth saying for a chord filed as unknown. */}
						<p className="wr-meta">
							Search <b className="wr-tab">{formatTabSequence(frets)}</b> again any time to rename it or file it somewhere
							else.
						</p>
						{!user && <p className="wr-meta">Saved on this device. Sign in and it moves to your account.</p>}
						<div className="wr-actions">
							<Button asChild size="sm">
								<Link href={chordHref(created.root, created.suffix)}>Open {name}</Link>
							</Button>
							<Button variant="secondary" size="sm" onClick={() => setCreated(null)}>
								Keep editing
							</Button>
							<Button asChild variant="ghost" size="sm">
								<Link href="/chords?view=mine">My chords</Link>
							</Button>
						</div>
					</section>
				</div>
			</div>
		);
	}

	return (
		<div className="wr-page">
			<div className="wr-in">
				{editing && mine
					? header(
							`Edit ${withGlyphs(chordSymbol(mine.root, mine.suffix))}`,
							"You already wrote this one. Rename it, refile it, or redraw it — it keeps its place wherever you have used it.",
						)
					: header(
							"Write a chord",
							<>
								Nothing in the library is held like <b className="wr-tab">{written}</b>. Name it and it is yours —
								searchable, playable, and there next time.
							</>,
						)}

				<div className="wr-cols">
					<section className="wr-panel" aria-label="The shape">
						<h2>The shape</h2>
						<ChordShapeEditor shape={shape} onChange={setShape} />
						<div className="wr-actions">
							<Button
								variant="secondary"
								size="sm"
								onClick={() => void preview.play(voicingPitches(chordShapeToVoicing(shape, "preview")))}
							>
								<Play aria-hidden />
								Hear it
							</Button>
						</div>
					</section>

					<div className="wr-side">
						{!editing && (
							<section className="wr-guess" aria-label="What the notes say">
								<span className="wr-label">
									{guesses.length === 0
										? "Nothing in the library has these notes"
										: guesses[0].exact
											? "Those notes are"
											: "Nothing has exactly those notes — closest"}
								</span>
								{guesses.length > 0 && (
									<div className="wr-chips">
										{guesses.map((guess) => {
											const name = chordDisplayName(guess.root, guess.suffix);
											return (
												<Chip key={name} pressed={chordName === name} title={`Call it ${name}`} onPressedChange={() => setChordName(name)}>
													{withGlyphs(chordSymbol(guess.root, guess.suffix))}
												</Chip>
											);
										})}
									</div>
								)}
								{/* The notes themselves, lowest first: when nothing can be named, the most useful thing to say. */}
								{notes.length > 0 && (
									<ol className="wr-notes" aria-label="The notes, lowest first">
										{notes.map((note) => (
											<li key={note}>{withGlyphs(note)}</li>
										))}
									</ol>
								)}
								<Button variant="ghost" size="xs" className="wr-unknown" onClick={nameItUnknown}>
									I don&rsquo;t know what it is — call it {unknownName}
								</Button>
							</section>
						)}

						<section className="wr-panel" aria-label="Name and file">
							<Field
								label="What is this chord called?"
								help={identity ? `Files as ${chordDisplayName(identity.root, identity.suffix)}.` : "Typed the way search reads it, so it can be typed back later."}
								error={identity || chordName.trim() === "" ? undefined : "Start with a note — C, F♯, B♭ — then the quality."}
							>
								{(control) => (
									<Input
										{...control}
										type="text"
										value={chordName}
										onChange={(e) => setChordName(e.target.value)}
										placeholder="e.g. Cadd9#11"
										aria-label="Chord name"
									/>
								)}
							</Field>
							<Field label="Name this shape (optional)">
								{(control) => (
									<Input
										{...control}
										type="text"
										value={shapeName}
										onChange={(e) => setShapeName(e.target.value)}
										placeholder="e.g. up at the seventh"
										aria-label="Name for this shape"
									/>
								)}
							</Field>
							<div className="wr-file">
								<span className="wr-label">File it under</span>
								<div className="wr-chips" role="group" aria-label="File it under">
									{[null, ...browseCategories()].map((option) => (
										<Chip key={option ?? UNFILED} pressed={option === category} onPressedChange={() => setCategory(option)}>
											{option ?? UNFILED}
										</Chip>
									))}
								</div>
								<span className="wr-meta">
									Where it sits when you browse the picker by category. {UNFILED} keeps it in your own section.
								</span>
							</div>
							<div className="wr-actions">
								<Button disabled={!valid} onClick={create}>
									{editing ? "Save changes" : "Create chord"}
								</Button>
								<Button asChild variant="ghost" size="sm">
									<Link href="/chords">Cancel</Link>
								</Button>
							</div>
						</section>
					</div>
				</div>
			</div>
		</div>
	);
}
