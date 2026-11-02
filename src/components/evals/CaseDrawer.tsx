"use client";

import { formatMetric } from "@/lib/evals/compare";
import type { EvalCase, EvalMetric, EvalRun } from "@/lib/evals/types";

/** Case-level numbers the run does not define as metrics, labelled by their key's unit. */
function caseMetric(key: string): EvalMetric {
	const label = key.replace(/_(ms|usd|s)$/, "").replace(/_/g, " ");
	const format = key.endsWith("_ms") ? "ms" : key.endsWith("_usd") ? "usd" : key.endsWith("_s") ? "s" : "fixed0";
	return { key, label, direction: "lower", format };
}

/**
 * One graded attempt: its verdict, numbers, what failed and the suite's
 * own detail (an assistant turn's input, reply and tool trace; a Q&A
 * question and the pages it cited). Long or structured values fold.
 */
export default function CaseDrawer({ run, selected, onClose }: { run: EvalRun; selected: EvalCase; onClose: () => void }) {
	const metricDef = new Map(run.metrics.map((m) => [m.key, m]));
	const subject = run.subjects.find((s) => s.id === selected.subject);
	const verdict = selected.error ? "error" : selected.pass === undefined ? null : selected.pass ? "pass" : "fail";

	return (
		<aside aria-label="Case detail" className="flex flex-col gap-3 rounded-md border border-gp-line bg-gp-card p-4 text-[13px]">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate font-mono text-[12px] text-gp-ink" title={selected.case}>
						{selected.case}
					</div>
					<div className="text-[12px] text-gp-ink-3">
						{subject?.label ?? selected.subject}
						{selected.repeat ? ` · repeat ${selected.repeat}` : ""}
					</div>
				</div>
				<button type="button" onClick={onClose} className="text-[12px] text-gp-ink-3 hover:text-gp-ink">
					Close
				</button>
			</div>
			{verdict && (
				<div
					className={`self-start rounded-full px-2 py-px font-mono text-[11px] uppercase ${
						verdict === "pass" ? "bg-gp-tab-100 text-gp-tab-500" : "bg-gp-bad/15 text-gp-bad"
					}`}
				>
					{verdict === "error" ? selected.error : verdict}
				</div>
			)}
			{Object.keys(selected.metrics).length > 0 && (
				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
					{Object.entries(selected.metrics).map(([key, value]) => {
						const def = metricDef.get(key) ?? caseMetric(key);
						return [
							<dt key={`${key}-k`} className="text-gp-ink-3">
								{def.label}
							</dt>,
							<dd key={`${key}-v`} className="m-0 font-mono tabular-nums text-gp-ink">
								{def.format === "fixed0" && !Number.isInteger(value) ? value.toFixed(3) : formatMetric(value, def)}
							</dd>,
						];
					})}
				</dl>
			)}
			{selected.failures && selected.failures.length > 0 && (
				<ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-gp-bad">
					{selected.failures.map((f) => (
						<li key={f}>{f}</li>
					))}
				</ul>
			)}
			{selected.detail &&
				Object.entries(selected.detail)
					.filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
					.map(([key, value]) => <DetailField key={key} name={key} value={value} />)}
		</aside>
	);
}

function DetailField({ name, value }: { name: string; value: unknown }) {
	const inline = Array.isArray(value) && value.every((v) => typeof v !== "object");
	const text = typeof value === "string" ? value : inline ? (value as unknown[]).join(", ") : JSON.stringify(value, null, 2);
	const long = text.length > 240 || text.includes("\n");
	const label = name.replace(/_/g, " ");
	if (!long) {
		return (
			<div className="flex flex-col gap-0.5">
				<span className="text-[11.5px] text-gp-ink-3">{label}</span>
				<span className="break-words font-mono text-[12px] text-gp-ink">{text}</span>
			</div>
		);
	}
	return (
		<details className="group">
			<summary className="cursor-pointer text-[11.5px] text-gp-ink-3 hover:text-gp-ink">{label}</summary>
			<pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-gp-page p-2 font-mono text-[11.5px] text-gp-ink">
				{text}
			</pre>
		</details>
	);
}
