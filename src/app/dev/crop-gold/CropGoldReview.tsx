"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavRouter } from "@/components/nav-progress";
import {
	boxChange,
	inPageOrder,
	moveBox,
	nextAddedId,
	nextUncheckedPage,
	pageNeighbours,
	type Box,
	type BoxChange,
	type CropBox,
	type CropGoldItem,
	type CropGoldRecord,
	type CropGoldStatus,
} from "@/lib/cropGold";
import BoxCanvas, { BOX_COLOURS } from "./BoxCanvas";
import CropPreview from "./CropPreview";
import { fetchBatches, fetchPage, pageHref, pageImageSrc, putPageReview } from "./cropGoldApi";

const CHANGE_LABEL: Record<BoxChange, string> = {
	kept: "As boxed",
	adjusted: "Adjusted",
	added: "Added",
	removed: "Not an exercise",
};

/** Arrow keys nudge the chosen box by this much of the page; with Shift, five times as far. */
const NUDGE = 0.002;

const sameBoxes = (a: readonly CropBox[], b: readonly CropBox[]): boolean => JSON.stringify(a) === JSON.stringify(b);

const isTyping = (target: EventTarget | null): boolean =>
	target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * One page: the page with the segmenter's boxes on the left, the chosen box's
 * crop and every box's verdict on the right. Drag a box or its handles to fix
 * it, drag on the bare page to box an exercise the segmenter missed, mark a
 * box that is not an exercise. Save keeps the boxes and moves to the next
 * unchecked page; Enter does the same from anywhere but a text field.
 */
export default function CropGoldReview({ batch, id }: { batch: string; id: string }) {
	const router = useNavRouter();
	const [record, setRecord] = useState<CropGoldRecord | null>(null);
	const [items, setItems] = useState<CropGoldItem[]>([]);
	const [boxes, setBoxes] = useState<CropBox[]>([]);
	const [note, setNote] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const [size, setSize] = useState<{ width: number; height: number } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		try {
			const [page, all] = await Promise.all([fetchPage(batch, id), fetchBatches()]);
			setRecord(page);
			setItems(all.batches.find((b) => b.name === batch)?.items ?? []);
			setBoxes(page.boxes);
			setNote(page.note);
			setSelected(inPageOrder(page.boxes)[0]?.id ?? null);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [batch, id]);

	useEffect(() => {
		// A fetch on open; its answer is what sets the state.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		void load();
	}, [load]);

	const ordered = useMemo(() => inPageOrder(boxes), [boxes]);
	const order = useMemo(() => new Map(ordered.map((b, i) => [b.id, i + 1])), [ordered]);
	const chosen = boxes.find((b) => b.id === selected) ?? null;
	const exercises = boxes.filter((b) => b.exercise).length;
	const dirty = record !== null && (!sameBoxes(boxes, record.boxes) || note !== record.note);
	const { prev, next } = pageNeighbours(items, id);
	const reviewed = items.filter((item) => item.status === "reviewed").length;

	const update = useCallback((boxId: string, change: (box: CropBox) => CropBox) => {
		setBoxes((all) => all.map((b) => (b.id === boxId ? change(b) : b)));
	}, []);

	const remove = useCallback(
		(box: CropBox) => {
			if (box.origin === null) {
				// A box the reviewer drew goes; a segmenter's box stays, marked, so the miss is counted.
				setBoxes((all) => all.filter((b) => b.id !== box.id));
				setSelected(null);
			} else {
				update(box.id, (b) => ({ ...b, exercise: !b.exercise }));
			}
		},
		[update],
	);

	const save = useCallback(
		async (status: CropGoldStatus, moveOn: boolean) => {
			if (!record || busy) return;
			setBusy(true);
			try {
				const saved = await putPageReview(batch, id, { status, boxes, note });
				const updated = items.map((item) => (item.id === id ? { ...item, status: saved.status } : item));
				if (moveOn) {
					const after = nextUncheckedPage(updated, id);
					router.push(after ? pageHref(batch, after) : "/dev/crop-gold");
					return;
				}
				setRecord(saved);
				setItems(updated);
				setBoxes(saved.boxes);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setBusy(false);
			}
		},
		[record, busy, batch, id, boxes, note, items, router],
	);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key === "Enter") {
				event.preventDefault();
				void save("reviewed", true);
				return;
			}
			if (!chosen) return;
			if (event.key === "Delete" || event.key === "Backspace") {
				event.preventDefault();
				remove(chosen);
				return;
			}
			const step = event.shiftKey ? NUDGE * 5 : NUDGE;
			const delta: Record<string, [number, number]> = {
				ArrowLeft: [-step, 0],
				ArrowRight: [step, 0],
				ArrowUp: [0, -step],
				ArrowDown: [0, step],
			};
			const d = delta[event.key];
			if (!d) return;
			event.preventDefault();
			update(chosen.id, (b) => ({ ...b, box: moveBox(b.box, d[0], d[1]) }));
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [chosen, save, remove, update]);

	if (error && !record) {
		return (
			<main className="tg">
				<p className="tg-error">{error}</p>
				<Link href="/dev/crop-gold">All pages</Link>
			</main>
		);
	}
	if (!record) return <main className="tg tg-meta">Loading…</main>;

	const src = pageImageSrc(batch, id);
	const counted = record.goldExercises;
	const off = counted !== null && counted !== exercises;
	const ar = size ? size.width / size.height : 0.707;

	return (
		<main className="tg cg-review">
			<nav className="tg-nav" aria-label="Pages">
				<Link href="/dev/crop-gold" className="tg-back">
					<ChevronLeft aria-hidden />
					All pages
				</Link>
				<span className="tg-meta">
					{batch} · {reviewed} of {items.length} pages reviewed
				</span>
				<span className="bk-grow" />
				<Button
					variant="icon"
					size="sm"
					aria-label="Previous page"
					disabled={!prev}
					onClick={() => prev && router.push(pageHref(batch, prev))}
				>
					<ChevronLeft aria-hidden />
				</Button>
				<Button
					variant="icon"
					size="sm"
					aria-label="Next page"
					disabled={!next}
					onClick={() => next && router.push(pageHref(batch, next))}
				>
					<ChevronRight aria-hidden />
				</Button>
			</nav>

			<header className="tg-head">
				<h1 className="tg-title">
					{record.set} p.{record.page}
				</h1>
				<span className="tg-status" data-status={record.status === "reviewed" ? "confirmed" : "unchecked"}>
					{record.status === "reviewed" ? "Reviewed" : "Unchecked"}
				</span>
				<p className="tg-meta">
					<span className="cg-count" data-off={off || undefined}>
						{exercises} boxed · {counted ?? "?"} on the page per page-gold
					</span>
					{record.goldNote && <> · {record.goldNote}</>}
				</p>
			</header>

			{error && <p className="tg-error">{error}</p>}

			<div className="cg-body" style={{ "--cg-ar": ar } as React.CSSProperties}>
				<section className="cg-left" aria-label="The page and its boxes">
					<BoxCanvas
						src={src}
						alt={`${record.set} page ${record.page}`}
						boxes={boxes}
						order={order}
						selected={selected}
						onSelect={setSelected}
						onChange={(boxId, box: Box) => update(boxId, (b) => ({ ...b, box }))}
						onDraw={(box) => {
							const added: CropBox = { id: nextAddedId(boxes), origin: null, box, heading: "", exercise: true };
							setBoxes((all) => [...all, added]);
							setSelected(added.id);
						}}
						onLoad={setSize}
					/>
					<p className="tg-meta">
						Drag a box or its handles · drag on the page to box a missed exercise · arrows nudge (Shift ×5) ·
						Delete marks not an exercise · Enter saves and moves on
					</p>
				</section>

				<section className="cg-right" aria-label="The chosen crop and every box">
					<div>
						<p className="bk-lbl">{chosen ? `Crop ${order.get(chosen.id)} as the reader will get it` : "No box chosen"}</p>
						{chosen ? (
							<CropPreview src={src} box={chosen.box} size={size} />
						) : (
							<p className="tg-meta">Click a box on the page.</p>
						)}
					</div>

					<ol className="cg-boxes">
						{ordered.map((b) => {
							const n = order.get(b.id) ?? 0;
							const change = boxChange(b, record.model);
							return (
								<li
									key={b.id}
									className="cg-row"
									data-selected={b.id === selected || undefined}
									onClick={() => setSelected(b.id)}
								>
									<span className="cg-row-n" style={{ background: BOX_COLOURS[(n - 1) % BOX_COLOURS.length] }}>
										{n}
									</span>
									<Input
										className="cg-row-heading"
										aria-label={`Box ${n} heading`}
										value={b.heading}
										placeholder="Heading as printed"
										onChange={(e) => update(b.id, (x) => ({ ...x, heading: e.target.value }))}
									/>
									<span className="cg-change" data-change={change}>
										{CHANGE_LABEL[change]}
									</span>
									{change === "adjusted" && (
										<Button
											variant="ghost"
											size="sm"
											onClick={(e) => {
												e.stopPropagation();
												const from = record.model.find((m) => m.id === b.origin);
												if (from) update(b.id, (x) => ({ ...x, box: from.box }));
											}}
										>
											Reset
										</Button>
									)}
									<Button
										variant="ghost"
										size="sm"
										onClick={(e) => {
											e.stopPropagation();
											remove(b);
										}}
									>
										{b.origin === null ? "Delete" : b.exercise ? "Not an exercise" : "Is an exercise"}
									</Button>
								</li>
							);
						})}
					</ol>

					<label className="tg-field tg-note">
						<span className="bk-lbl">Note</span>
						<textarea
							value={note}
							onChange={(e) => setNote(e.target.value)}
							rows={2}
							placeholder="What the segmenter got wrong on this page"
						/>
					</label>

					<div className="tg-actions">
						<Button onClick={() => void save("reviewed", true)} disabled={busy}>
							Save and next
						</Button>
						<Button variant="secondary" onClick={() => void save("reviewed", false)} disabled={busy || !dirty}>
							Save
						</Button>
						<span className="bk-grow" />
						<Button
							variant="ghost"
							onClick={() => {
								setBoxes(record.model);
								setSelected(inPageOrder(record.model)[0]?.id ?? null);
							}}
							disabled={busy || sameBoxes(boxes, record.model)}
						>
							Back to the segmenter&apos;s boxes
						</Button>
						{record.status !== "unchecked" && (
							<Button variant="ghost" onClick={() => void save("unchecked", false)} disabled={busy}>
								Back to unchecked
							</Button>
						)}
					</div>
				</section>
			</div>
		</main>
	);
}
