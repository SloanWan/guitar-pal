"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { ChapterRange } from "@/lib/books/types";
import { validateRanges } from "@/lib/books/ranges";
import { DenimButton, GhostButton, MONO_META } from "@/components/books/bookUi";

const FIELD =
	"h-8 border border-line-strong bg-surface px-2 font-mono text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1";

/**
 * The player's own chapters, edited in place: a title and a page span per
 * row. Rules checked as typed (`validateRanges`), the offending row marked;
 * the service's 422 is shown as is if it still disagrees.
 */
export default function ChapterRangeEditor({
	initial,
	pageCount,
	saving,
	serverError,
	onSave,
	onCancel,
}: {
	initial: ChapterRange[];
	pageCount: number;
	saving: boolean;
	serverError: string | null;
	onSave: (ranges: ChapterRange[]) => void;
	onCancel: () => void;
}) {
	const [ranges, setRanges] = useState<ChapterRange[]>(
		initial.length > 0 ? initial : [{ title: "Whole book", page_start: 1, page_end: pageCount }],
	);
	const problems = validateRanges(ranges, pageCount);
	const problemFor = (index: number) => problems.find((p) => p.index === index)?.message;

	function update(index: number, patch: Partial<ChapterRange>) {
		setRanges((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
	}

	function add() {
		setRanges((current) => {
			const lastEnd = current.reduce((max, r) => Math.max(max, r.page_end), 0);
			const start = Math.min(lastEnd + 1, pageCount);
			return [...current, { title: `Chapter ${current.length + 1}`, page_start: start, page_end: pageCount }];
		});
	}

	return (
		<div>
			<ul>
				{ranges.map((range, index) => {
					const problem = problemFor(index);
					return (
						<li
							key={index}
							className={`flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 ${
								problem ? "bg-destructive-tint" : ""
							}`}
						>
							<span className={`${MONO_META} w-6 flex-none tabular-nums`}>
								{String(index + 1).padStart(2, "0")}
							</span>
							<input
								aria-label={`Chapter ${index + 1} title`}
								value={range.title}
								onChange={(e) => update(index, { title: e.target.value })}
								className={`${FIELD} min-w-0 flex-1`}
								maxLength={200}
							/>
							<span className="flex items-center gap-1.5">
								<input
									aria-label={`Chapter ${index + 1} first page`}
									type="number"
									inputMode="numeric"
									min={1}
									max={pageCount}
									value={range.page_start}
									onChange={(e) => update(index, { page_start: e.target.valueAsNumber })}
									className={`${FIELD} w-16 text-right tabular-nums`}
								/>
								<span className={MONO_META}>–</span>
								<input
									aria-label={`Chapter ${index + 1} last page`}
									type="number"
									inputMode="numeric"
									min={1}
									max={pageCount}
									value={range.page_end}
									onChange={(e) => update(index, { page_end: e.target.valueAsNumber })}
									className={`${FIELD} w-16 text-right tabular-nums`}
								/>
								<button
									type="button"
									aria-label={`Remove chapter ${index + 1}`}
									onClick={() => setRanges((current) => current.filter((_, i) => i !== index))}
									disabled={ranges.length === 1}
									className="flex size-8 items-center justify-center text-ink-faint transition-colors hover:text-destructive disabled:opacity-40"
								>
									<X className="size-3.5" strokeWidth={1.5} strokeLinecap="square" />
								</button>
							</span>
							{problem ? (
								<p className="text-[11px] text-destructive sm:w-full sm:pl-9">{problem}</p>
							) : null}
						</li>
					);
				})}
			</ul>
			<div className="flex flex-wrap items-center gap-3 px-4 py-3">
				<GhostButton onClick={add}>
					<Plus className="size-3.5" strokeWidth={1.5} strokeLinecap="square" aria-hidden="true" />
					Add chapter
				</GhostButton>
				<span className="flex-1 text-[11px] text-destructive">{serverError}</span>
				<GhostButton onClick={onCancel} disabled={saving}>
					Cancel
				</GhostButton>
				<DenimButton
					onClick={() => onSave(ranges.map((r) => ({ ...r, title: r.title.trim() })))}
					disabled={saving || problems.length > 0}
				>
					{saving ? "Saving…" : "Save ranges"}
				</DenimButton>
			</div>
		</div>
	);
}
