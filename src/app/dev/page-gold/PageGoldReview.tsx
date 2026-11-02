"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/AppLink";
import ZoomableImage from "@/components/ZoomableImage";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { useNavRouter } from "@/components/nav-progress";
import {
	MAX_EXERCISES,
	NOTATIONS,
	PAGE_KINDS,
	type Notation,
	type PageGoldDecision,
	type PageGoldRecord,
	type PageGoldSet,
	type PageKind,
} from "@/lib/pageGold";
import { neighbours, nextUnchecked, type TabGoldItem } from "@/lib/tabGold";
import StatusChip from "../tab-gold/StatusChip";
import { KIND_LABEL, NOTATION_LABEL } from "./kinds";
import { fetchPage, fetchPageSets, pageHref, pageSrc, putPageReview } from "./pageGoldApi";

/** Every page of every book in order, keyed `set/id`, so Save moves on across books. */
function flatten(sets: readonly PageGoldSet[]): TabGoldItem[] {
	return sets.flatMap((set) => set.items.map((item) => ({ ...item, id: `${set.name}/${item.id}` })));
}
const hrefOf = (key: string): string => {
	const [set, id] = key.split("/");
	return pageHref(set, id);
};

/**
 * One page: the page on the left, the answer beside it — its kind (the
 * model's to start with), the notation printed on it, and how many tab
 * exercises it holds. Save keeps the answer and moves to the next unchecked
 * page; Enter does the same from anywhere but the note.
 */
export default function PageGoldReview({ set, id }: { set: string; id: string }) {
	const router = useNavRouter();
	const [record, setRecord] = useState<PageGoldRecord | null>(null);
	const [items, setItems] = useState<TabGoldItem[]>([]);
	const [title, setTitle] = useState(set);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [kind, setKind] = useState<PageKind | null>(null);
	const [notation, setNotation] = useState<Notation[]>([]);
	const [exercises, setExercises] = useState("");
	const [note, setNote] = useState("");
	const formRef = useRef<HTMLFormElement>(null);

	const load = useCallback(async () => {
		try {
			const [next, all] = await Promise.all([fetchPage(set, id), fetchPageSets()]);
			setRecord(next);
			setItems(flatten(all.sets));
			setTitle(all.sets.find((s) => s.name === set)?.title ?? set);
			setKind(next.kind);
			setNotation(next.notation);
			setExercises(next.exercises === null ? "" : String(next.exercises));
			setNote(next.note);
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

	// Enter saves from anywhere on the page but a text field, which keeps its own Enter.
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key !== "Enter" || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
			const target = e.target as HTMLElement | null;
			if (target?.closest("textarea, input, button, a, [role='dialog']")) return;
			e.preventDefault();
			formRef.current?.requestSubmit();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const key = `${set}/${id}`;
	const { prev, next } = neighbours(items, key);
	const reviewed = items.filter((item) => item.status !== "unchecked").length;
	const hasTab = notation.includes("tab");
	const count = Number(exercises);
	const countValid = exercises.trim() !== "" && Number.isInteger(count) && count >= 0 && count <= MAX_EXERCISES;
	const canSave = kind !== null && (!hasTab || countValid);

	async function send(decision: PageGoldDecision, moveOn: boolean) {
		if (!record || busy) return;
		setBusy(true);
		try {
			const saved = await putPageReview(set, id, {
				decision,
				kind,
				notation,
				exercises: hasTab ? count : 0,
				note,
			});
			const updated = items.map((item) => (item.id === key ? { ...item, status: saved.status } : item));
			if (moveOn) {
				const after = nextUnchecked(updated, key);
				router.push(after ? hrefOf(after) : "/dev/page-gold");
				return;
			}
			setRecord(saved);
			setItems(updated);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}
	function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (canSave) void send("answer", true);
	}
	const toggle = (n: Notation, on: boolean) =>
		setNotation((current) => NOTATIONS.filter((x) => (x === n ? on : current.includes(x))));

	if (error && !record) {
		return (
			<main className="tg">
				<p className="tg-error">{error}</p>
				<Link href="/dev/page-gold">All pages</Link>
			</main>
		);
	}
	if (!record) return <main className="tg tg-meta">Loading…</main>;

	const modelKind = record.model.kind === "error" ? null : record.model.kind;

	return (
		<main className="tg pg-review">
			<nav className="tg-nav" aria-label="Pages">
				<Link href="/dev/page-gold" className="tg-back">
					<ChevronLeft aria-hidden />
					All pages
				</Link>
				<span className="tg-meta">
					{reviewed} of {items.length} reviewed
				</span>
				<span className="bk-grow" />
				<Button variant="icon" size="sm" aria-label="Previous page" disabled={!prev} onClick={() => prev && router.push(hrefOf(prev))}>
					<ChevronLeft aria-hidden />
				</Button>
				<Button variant="icon" size="sm" aria-label="Next page" disabled={!next} onClick={() => next && router.push(hrefOf(next))}>
					<ChevronRight aria-hidden />
				</Button>
			</nav>

			<div className="pg-body">
				<section className="pg-page" aria-label="The page">
					<ZoomableImage src={pageSrc(record)} alt={`${title}, page ${record.page}`} className="pg-img" />
				</section>

				<form ref={formRef} className="pg-panel" onSubmit={onSubmit} aria-label="The answer">
					<header className="tg-head">
						<h1 className="tg-title">p.{record.page}</h1>
						<StatusChip status={record.status} />
						<p className="tg-meta">{title}</p>
					</header>

					<p className="pg-model">
						The model said <b>{modelKind ? KIND_LABEL[modelKind].label : "nothing (it failed twice)"}</b>
						{record.model.regions.length > 0 && <> — areas: {record.model.regions.join(", ")}</>}
						{record.model.note && <span className="pg-model-note">{record.model.note}</span>}
					</p>

					{error && <p className="tg-error">{error}</p>}
					<fieldset className="pg-field">
						<legend className="bk-lbl">Kind</legend>
						<div className="pg-kinds">
							{PAGE_KINDS.map((k) => (
								<Chip key={k} pressed={kind === k} onPressedChange={() => setKind(k)} title={KIND_LABEL[k].help}>
									{KIND_LABEL[k].label}
									{k === modelKind && <span className="pg-was" aria-label="the model's answer">·</span>}
								</Chip>
							))}
						</div>
						<details className="pg-rules">
							<summary>How to choose</summary>
							<dl>
								{PAGE_KINDS.map((k) => (
									<div key={k}>
										<dt>{KIND_LABEL[k].label}</dt>
										<dd>{KIND_LABEL[k].help}</dd>
									</div>
								))}
							</dl>
							<p>
								Headings, captions and a line or two of instruction belong to what they label. A page is
								Mixed only when it has two areas that would each be a kind on their own — a block of
								explanation and a tab example, or tab beside chord diagrams.
							</p>
						</details>
					</fieldset>

					<fieldset className="pg-field">
						<legend className="bk-lbl">Printed on the page</legend>
						<div className="pg-kinds">
							{NOTATIONS.map((n) => (
								<Chip key={n} pressed={notation.includes(n)} onPressedChange={(on) => toggle(n, on)}>
									{NOTATION_LABEL[n]}
								</Chip>
							))}
						</div>
					</fieldset>

					<label className="pg-field pg-count">
						<span className="bk-lbl">Tab exercises on the page</span>
						<span className="pg-count-row">
							<Input
								type="number"
								inputMode="numeric"
								min={0}
								max={MAX_EXERCISES}
								value={hasTab ? exercises : "0"}
								disabled={!hasTab}
								autoFocus={hasTab && record.exercises === null}
								onChange={(e) => setExercises(e.target.value)}
								aria-describedby="pg-count-help"
							/>
							<span id="pg-count-help" className="tg-meta">
								{hasTab
									? "A heading with the tab staves under it is one; a staff with no heading belongs to the one above, and one carried over from the last page counts here."
									: "No tab on the page, so none."}
							</span>
						</span>
					</label>

					<label className="tg-field tg-note">
						<span className="bk-lbl">Note</span>
						<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything odd about this page" />
					</label>

					<div className="tg-actions">
						<Button type="submit" disabled={busy || !canSave} title="Keep this answer and go to the next unchecked page (Enter)">
							Save and next
						</Button>
						<Button
							variant="secondary"
							onClick={() => void send("unusable", true)}
							disabled={busy}
							title="The page cannot be judged (cut off, unreadable): kept out of the score"
						>
							Unusable
						</Button>
						<span className="bk-grow" />
						<Button variant="ghost" onClick={() => void send("unchecked", false)} disabled={busy || record.status === "unchecked"}>
							Back to unchecked
						</Button>
					</div>
				</form>
			</div>
		</main>
	);
}
