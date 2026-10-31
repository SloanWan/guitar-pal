"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { ChapterRange } from "@/lib/books/types";
import { validateRanges } from "@/lib/books/ranges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
		<section className="bk-card bk-ranges" aria-label="Chapter ranges">
			<div className="bk-ranges-h">
				<h2 className="bk-h2">Chapter ranges</h2>
				<span className="bk-meta">{pageCount} pages in the PDF</span>
			</div>
			<ol className="bk-ranges-list">
				{ranges.map((range, index) => {
					const problem = problemFor(index);
					return (
						<li key={index} className="bk-range" data-problem={problem ? "" : undefined}>
							<span className="bk-range-n">{String(index + 1).padStart(2, "0")}</span>
							<Input
								aria-label={`Chapter ${index + 1} title`}
								value={range.title}
								onChange={(e) => update(index, { title: e.target.value })}
								className="bk-range-title"
								maxLength={200}
							/>
							<span className="bk-range-pages">
								<Input
									aria-label={`Chapter ${index + 1} first page`}
									type="number"
									inputMode="numeric"
									min={1}
									max={pageCount}
									value={range.page_start}
									onChange={(e) => update(index, { page_start: e.target.valueAsNumber })}
									className="bk-range-page"
								/>
								<span className="bk-meta">–</span>
								<Input
									aria-label={`Chapter ${index + 1} last page`}
									type="number"
									inputMode="numeric"
									min={1}
									max={pageCount}
									value={range.page_end}
									onChange={(e) => update(index, { page_end: e.target.valueAsNumber })}
									className="bk-range-page"
								/>
								<Button
									variant="ghost"
									size="sm"
									aria-label={`Remove chapter ${index + 1}`}
									onClick={() => setRanges((current) => current.filter((_, i) => i !== index))}
									disabled={ranges.length === 1}
									className="bk-range-x"
								>
									<X aria-hidden />
								</Button>
							</span>
							{problem ? <p className="bk-range-problem">{problem}</p> : null}
						</li>
					);
				})}
			</ol>
			<div className="bk-ranges-f">
				<Button variant="secondary" size="sm" onClick={add}>
					<Plus aria-hidden />
					Add chapter
				</Button>
				<span className="bk-range-problem bk-grow" role={serverError ? "alert" : undefined}>
					{serverError}
				</span>
				<Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
					Cancel
				</Button>
				<Button size="sm" onClick={() => onSave(ranges.map((r) => ({ ...r, title: r.title.trim() })))} disabled={problems.length > 0} loading={saving}>
					Save ranges
				</Button>
			</div>
		</section>
	);
}
