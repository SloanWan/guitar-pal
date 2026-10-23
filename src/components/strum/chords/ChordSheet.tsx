"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";
import { useBarChordDiagrams } from "@/components/strum/useBarChordDiagrams";
import ChordDiagram from "@/components/strum/stage/ChordDiagram";
import type { Bar, ChordRef } from "@/lib/strumPatterns";
import { barPlaceholder, selectRefVoicing } from "@/lib/strumBars";
import { voicingReach, type VoicingScope } from "@/lib/strumBarEdit";
import { chordAbbreviation } from "@/lib/strumProgressions";
import { chordDisplayName } from "@/lib/chordSuffixes";
import { voicingToDiagramShape, type ChordVoicing } from "@/lib/chordVoicing";
import { loadVoicings } from "@/lib/chordVoicingCache";
import { getChordIndex } from "@/lib/chords";
import { searchChords, type ChordIndexEntry } from "@/lib/chordSearch";
import { chordIndexWithUser, isUserVoicingId, mergeVoicings, type UserChordVoicing } from "@/lib/userChordVoicings";
import CustomShapeEditor, { CustomShapeFooter, startDraft, type ShapeDraft } from "./CustomShapeEditor";
import { useChordPreview } from "./useChordPreview";
import "./chords.css";

/** How many chords the search offers at once. */
const RESULT_LIMIT = 12;

interface Props {
	/** The bar being changed; null while the sheet is shut. */
	barIndex: number | null;
	bars: Bar[];
	userVoicings: readonly UserChordVoicing[];
	/** Files a shape the player drew; returns the row it actually lives in. */
	onSaveVoicing: (voicing: UserChordVoicing) => UserChordVoicing;
	onApply: (barIndex: number, chord: ChordRef, scope: VoicingScope) => void;
	onRemove: (barIndex: number) => void;
	onClose: () => void;
}

function sameChord(a: ChordRef | null, b: ChordRef | null): boolean {
	return a !== null && b !== null && a.root === b.root && a.suffix === b.suffix;
}

/**
 * Change one bar's chord: the shapes of the chord it has (and "My own shape"),
 * or another chord from a search. Nothing changes until Apply — the choice is
 * pending, heard with "Hear it", and the bar keeps playing what it had.
 */
export default function ChordSheet(props: Props) {
	// The bar on show outlives the close, so the sheet slides away with its content
	// instead of emptying first; each opening (or a move to another bar) counts up
	// and keys a fresh chooser, so a choice left pending is not there next time.
	const [shown, setShown] = useState({ from: props.barIndex, bar: props.barIndex, opening: 0 });
	if (props.barIndex !== shown.from) {
		setShown(
			props.barIndex === null
				? { ...shown, from: null }
				: { from: props.barIndex, bar: props.barIndex, opening: shown.opening + 1 },
		);
	}
	if (shown.bar === null) return null;
	return <ChordChooser key={shown.opening} {...props} open={props.barIndex !== null} barIndex={shown.bar} />;
}

/** The sheet and everything in it; its footer reads the pending choice, so both live here. */
function ChordChooser({
	open,
	barIndex,
	bars,
	userVoicings,
	onSaveVoicing,
	onApply,
	onRemove,
	onClose,
}: Omit<Props, "barIndex"> & { open: boolean; barIndex: number }) {
	const bar = bars[barIndex];
	const kept = bar ? barPlaceholder(bar) : null;
	const current = bar?.chord ?? null;
	const [pending, setPending] = useState<ChordRef | null>(current);
	const [query, setQuery] = useState(kept ?? "");
	// "My own shape" while there is a draft, the chord list otherwise.
	const [draft, setDraft] = useState<ShapeDraft | null>(null);
	const [library, setLibrary] = useState<{ key: string; voicings: ChordVoicing[] } | null>(null);
	const [index, setIndex] = useState<readonly ChordIndexEntry[]>([]);
	const preview = useChordPreview();

	useEffect(() => {
		let cancelled = false;
		getChordIndex()
			.then((entries) => {
				if (!cancelled) setIndex(entries);
			})
			.catch((e: unknown) => console.error("[ChordSheet] chord index:", e));
		return () => {
			cancelled = true;
		};
	}, []);

	const pendingKey = pending ? `${pending.root}|${pending.suffix}` : "";
	useEffect(() => {
		if (!pending) return;
		let cancelled = false;
		loadVoicings(pending.root, pending.suffix)
			.then((voicings) => {
				if (!cancelled) setLibrary({ key: `${pending.root}|${pending.suffix}`, voicings });
			})
			.catch((e: unknown) => console.error("[ChordSheet] voicings:", e));
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the chord's identity, not its pinned shape
	}, [pendingKey]);

	const shapes = pending && library?.key === pendingKey ? mergeVoicings(library.voicings, userVoicings, pending.root, pending.suffix) : [];
	const selected = pending ? selectRefVoicing(pending, shapes) : null;

	const searchIndex = chordIndexWithUser(index, userVoicings);
	// An empty search lists the family of the chord in hand: the same root's chords.
	const wanted = query.trim() || pending?.root || current?.root || "C";
	const results = searchChords(searchIndex, wanted, RESULT_LIMIT);
	// The diagram hook keys on the chords' names, so a fresh array each render costs nothing.
	const resultDiagrams = useBarChordDiagrams(
		results.map((r): Bar => ({ beats: [], chord: { root: r.root, suffix: r.suffix } })),
		true,
		userVoicings,
	);

	const reach = voicingReach(bars, barIndex, "chord").filter(Boolean).length;
	const unchanged = sameChord(pending, current) && (pending?.voicingId ?? null) === (current?.voicingId ?? null);
	// Offered when the change can mean more than this bar: re-shaping a chord that
	// plays elsewhere too, or naming a chord kept under a name used again.
	const canApplyAll = pending !== null && reach > 1 && (kept !== null || sameChord(pending, current));
	const pendingName = pending ? chordAbbreviation(pending) : kept ?? "No chord";
	const back = () => setDraft(null);

	function apply(scope: VoicingScope) {
		if (!pending) return;
		if (scope === "bar" && unchanged) return onClose();
		onApply(barIndex, pending, scope);
		onClose();
	}

	const list = (
		<div className="st-slide">
			<div>
				<span className="st-lab">{kept && !pending ? `"${kept}" isn't in the chord library` : "Chord"}</span>
				<h3 className="m-0 text-xl font-extrabold">{pendingName}</h3>
			</div>

			<section className="flex flex-col gap-2.5" aria-label={pending ? `Shapes of ${pendingName}` : "Shapes"}>
				<h4 className="m-0 text-[13px] font-bold">{pending ? `Shapes of ${pendingName}` : "Draw it"}</h4>
				<div className="st-shapes">
					{shapes.map((voicing) => (
						<button
							key={voicing.id}
							type="button"
							className="st-shape"
							aria-pressed={selected?.id === voicing.id}
							aria-label={`${pendingName}, ${voicing.label ?? (isUserVoicingId(voicing.id) ? "my shape" : "shape")}`}
							onClick={() => pending && setPending({ ...pending, voicingId: voicing.id })}
						>
							<span className="st-dg" data-size="sm" aria-hidden>
								<ChordDiagramSVG {...voicingToDiagramShape(voicing)} size="compact" />
							</span>
							<span className="st-lab">{voicing.label ?? (isUserVoicingId(voicing.id) ? "Mine" : "—")}</span>
						</button>
					))}
					<button type="button" className="st-shape" data-add onClick={() => setDraft(startDraft(selected, pending ? null : kept))}>
						<Plus aria-hidden />
						<span className="st-lab">My own shape</span>
					</button>
				</div>
			</section>

			<section className="flex flex-col gap-2.5" aria-label="Another chord">
				<h4 className="m-0 text-[13px] font-bold">Another chord</h4>
				<SearchInput
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search chords, e.g. Am7, sus4"
					aria-label="Search chords"
				/>
				<div className="st-shapes">
					{results.map((result, i) => {
						const ref: ChordRef = { root: result.root, suffix: result.suffix, voicingId: null };
						return (
							<button
								key={`${result.root}|${result.suffix}`}
								type="button"
								className="st-shape"
								aria-pressed={sameChord(pending, ref)}
								aria-label={chordDisplayName(result.root, result.suffix)}
								onClick={() => setPending(ref)}
							>
								<span className="font-bold">{chordAbbreviation(ref)}</span>
								<ChordDiagram diagram={resultDiagrams[i] ?? null} size="sm" />
							</button>
						);
					})}
				</div>
				{query.trim() !== "" && results.length === 0 && <p className="st-lab m-0">No chord called “{query.trim()}”.</p>}
			</section>
		</div>
	);

	const chooserFoot = (
		<div className="st-chord-foot" data-m="strum">
			<Button
				variant="ghost"
				size="xs"
				disabled={bars.length <= 1}
				onClick={() => {
					onRemove(barIndex);
					onClose();
				}}
			>
				Remove bar
			</Button>
			<span className="flex-1" />
			<Button variant="secondary" size="xs" disabled={!selected} onClick={() => selected && void preview.play(selected)}>
				Hear it
			</Button>
			{canApplyAll && (
				<Button variant="secondary" size="xs" onClick={() => apply("chord")}>
					Apply to all {reach}
				</Button>
			)}
			<Button size="xs" disabled={!pending} onClick={() => apply("bar")}>
				{unchanged ? "Done" : "Apply"}
			</Button>
		</div>
	);

	const customFoot = draft && (
		<div className="st-chord-foot" data-m="strum">
			<CustomShapeFooter
				chord={pending}
				draft={draft}
				onBack={back}
				onHear={(voicing) => void preview.play(voicing)}
				onSave={(voicing) => {
					const stored = onSaveVoicing(voicing);
					setPending({ root: stored.root, suffix: stored.suffix, voicingId: stored.id });
					setDraft(null);
				}}
			/>
		</div>
	);

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => (next ? undefined : onClose())}
			title={`Bar ${barIndex + 1}`}
			// a bar removed as the sheet closes leaves nothing to show while it slides away
			footer={bar ? customFoot || chooserFoot : null}
		>
			{/* Portaled out of the page, so the module's colours are named again here (and on the footer). */}
			{bar && (
				<div data-m="strum">
					{draft ? (
						<CustomShapeEditor
							chord={pending}
							draft={draft}
							onDraftChange={(update) => setDraft((d) => d && update(d))}
							onBack={back}
						/>
					) : (
						list
					)}
				</div>
			)}
		</Sheet>
	);
}
