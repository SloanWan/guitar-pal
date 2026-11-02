"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import Link from "@/components/AppLink";
import ZoomableImage from "@/components/ZoomableImage";
import { WarningsFold } from "@/components/books/IssueList";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useNavRouter } from "@/components/nav-progress";
import {
	modelPattern,
	neighbours,
	nextUnchecked,
	unplacedChords,
	type TabGoldItem,
	type TabGoldRecord,
	type TabGoldStatus,
} from "@/lib/tabGold";
import GoldStave from "./GoldStave";
import StatusChip from "./StatusChip";
import { cropSrc, fetchRecord, fetchSets, putReview, reviewHref } from "./tabGoldApi";

type Jianpu = "yes" | "no" | "unsaid";
const toJianpu = (value: boolean | null): Jianpu => (value === null ? "unsaid" : value ? "yes" : "no");
const fromJianpu = (value: Jianpu): boolean | null => (value === "unsaid" ? null : value === "yes");

/**
 * One exercise: the crop the model read above the reading it made, drawn and
 * playable at the same width so bar lines can be compared by eye. "Model got
 * it right" keeps the model's reading as the gold; Edit opens the tab editor on
 * it with the crop above, and its Save keeps the edit as the gold — after
 * which Next only moves on, so the correction is never replaced by the reading
 * it corrected. Unusable keeps the exercise out of the score.
 */
export default function TabGoldReview({ set, id }: { set: string; id: string }) {
	const router = useNavRouter();
	const [record, setRecord] = useState<TabGoldRecord | null>(null);
	const [items, setItems] = useState<TabGoldItem[]>([]);
	const [title, setTitle] = useState(set);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [view, setView] = useState<"model" | "gold">("model");
	const [jianpu, setJianpu] = useState<Jianpu>("unsaid");
	const [note, setNote] = useState("");

	const load = useCallback(async () => {
		try {
			const [next, all] = await Promise.all([fetchRecord(set, id), fetchSets()]);
			const ofSet = all.sets.find((s) => s.name === set);
			setRecord(next);
			setItems(ofSet?.items ?? []);
			setTitle(ofSet?.title ?? set);
			setJianpu(toJianpu(next.jianpu));
			setNote(next.note);
			setView(next.status === "corrected" && next.gold ? "gold" : "model");
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [set, id]);

	useEffect(() => {
		// A fetch on open; its answer is what sets the state.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		void load();
	}, [load]);

	const model = useMemo(() => (record ? modelPattern(record) : null), [record]);
	const { prev, next } = neighbours(items, id);
	const reviewed = items.length - items.filter((item) => item.status === "unchecked").length;
	const sideDirty = record !== null && (fromJianpu(jianpu) !== record.jianpu || note !== record.note);

	async function review(status: TabGoldStatus, gold: TabGoldRecord["gold"], moveOn: boolean) {
		if (!record || busy) return;
		setBusy(true);
		try {
			const saved = await putReview(set, id, { status, gold, jianpu: fromJianpu(jianpu), note });
			const updated = items.map((item) => (item.id === id ? { ...item, status: saved.status } : item));
			if (moveOn) {
				const after = nextUnchecked(updated, id);
				router.push(after ? reviewHref(set, after) : "/dev/tab-gold");
				return;
			}
			setRecord(saved);
			setItems(updated);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	function moveOn() {
		if (!record) return;
		if (sideDirty) return void review(record.status, record.gold, true);
		const after = nextUnchecked(items, id);
		router.push(after ? reviewHref(set, after) : "/dev/tab-gold");
	}

	async function edit() {
		if (!record) return;
		// The jianpu answer and the note go with the record, not with the editor.
		if (sideDirty) await review(record.status, record.gold, false);
		router.push(`${reviewHref(set, id)}/edit`);
	}

	if (error && !record) {
		return (
			<main className="tg">
				<p className="tg-error">{error}</p>
				<Link href="/dev/tab-gold">All exercises</Link>
			</main>
		);
	}
	if (!record || !model) return <main className="tg tg-meta">Loading…</main>;

	const shown = view === "gold" && record.gold ? record.gold : model.pattern;
	const modelStatus = record.status;
	const corrected = record.status === "corrected";
	// A printed chord line the reading cannot carry: the answer needs it placed.
	const chords = unplacedChords(record, corrected ? record.gold : model.pattern);

	return (
		<main className="tg tg-review">
			<nav className="tg-nav" aria-label="Exercises">
				<Link href="/dev/tab-gold" className="tg-back">
					<ChevronLeft aria-hidden />
					All exercises
				</Link>
				<span className="tg-meta">
					{title} · {reviewed} of {items.length} reviewed
				</span>
				<span className="bk-grow" />
				<Button
					variant="icon"
					size="sm"
					aria-label="Previous exercise"
					disabled={!prev}
					onClick={() => prev && router.push(reviewHref(set, prev))}
				>
					<ChevronLeft aria-hidden />
				</Button>
				<Button
					variant="icon"
					size="sm"
					aria-label="Next exercise"
					disabled={!next}
					onClick={() => next && router.push(reviewHref(set, next))}
				>
					<ChevronRight aria-hidden />
				</Button>
			</nav>

			<header className="tg-head">
				<h1 className="tg-title">{record.name}</h1>
				<p className="tg-meta">
					p.{record.page ?? "?"} · {record.id} · read by {record.model.source}
				</p>
				<StatusChip status={modelStatus} />
			</header>

			{error && <p className="tg-error">{error}</p>}

			<div className="tg-body">
				<section className="tg-crop" aria-label="The page the model read">
					<p className="bk-lbl">In the book</p>
					<ZoomableImage src={cropSrc(record)} alt={`Page ${record.page}, ${record.name}`} className="tg-crop-img" />
				</section>

				<section className="tg-reading" aria-label="The reading">
					<div className="tg-reading-head">
						<p className="bk-lbl">{view === "gold" ? "Your correction" : "As the model read it"}</p>
						{record.gold && record.status === "corrected" && (
							<Segmented
								label="Which reading"
								dense
								options={[
									{ value: "model", label: "Model" },
									{ value: "gold", label: "Corrected" },
								]}
								value={view}
								onChange={setView}
							/>
						)}
					</div>

					{chords.length > 0 && (
						<p className="tg-chords">
							Chords over the bars, read but not placed: <b>{chords.join(" ")}</b>. Mark each over the note it
							starts on in Edit (Slot → Chord).
						</p>
					)}

					{shown ? (
						<GoldStave key={`${view}-${record.reviewedAt}`} pattern={shown} />
					) : (
						<div className="tg-error">
							<p>The model&apos;s draft is not a valid tab, so it cannot be drawn:</p>
							<ul>
								{model.errors.map((e) => (
									<li key={`${e.code}-${e.path}`}>{e.message}</li>
								))}
							</ul>
						</div>
					)}

					{view === "model" && <WarningsFold issues={record.model.warnings} />}

					<div className="tg-form">
						<div className="tg-field">
							<span className="bk-lbl">Jianpu row under the staff?</span>
							<Segmented
								label="Jianpu row under the staff"
								dense
								options={[
									{ value: "yes", label: "Yes" },
									{ value: "no", label: "No" },
									{ value: "unsaid", label: "—" },
								]}
								value={jianpu}
								onChange={setJianpu}
							/>
						</div>
						<label className="tg-field tg-note">
							<span className="bk-lbl">Note</span>
							<textarea
								value={note}
								onChange={(e) => setNote(e.target.value)}
								rows={2}
								placeholder="What the model got wrong, or why this one is unusable"
							/>
						</label>
					</div>

					<div className="tg-actions">
						{corrected ? (
							<Button onClick={moveOn} disabled={busy} title="Your correction is saved; on to the next unchecked exercise">
								Next
							</Button>
						) : (
							<Button
								onClick={() => void review("confirmed", model.pattern, true)}
								disabled={busy || !model.pattern || chords.length > 0}
								title={
									chords.length > 0
										? "The page prints chords the reading does not place: mark them with Edit"
										: "The model's reading matches the page note for note: keep it as the answer"
								}
							>
								Model got it right
							</Button>
						)}
						<Button variant="secondary" onClick={() => void edit()} disabled={busy}>
							<Pencil aria-hidden />
							{corrected ? "Edit the correction" : "Edit"}
						</Button>
						<Button
							variant="secondary"
							onClick={() => void review("unusable", null, true)}
							disabled={busy}
							title="Not an exercise, or the crop lost part of it: kept out of the score"
						>
							Unusable
						</Button>
						<span className="bk-grow" />
						{sideDirty && record.status !== "unchecked" && (
							<Button variant="ghost" onClick={() => void review(record.status, record.gold, false)} disabled={busy}>
								Save note
							</Button>
						)}
						{record.status !== "unchecked" && (
							<Button variant="ghost" onClick={() => void review("unchecked", null, false)} disabled={busy}>
								Back to unchecked
							</Button>
						)}
					</div>
				</section>
			</div>
		</main>
	);
}
