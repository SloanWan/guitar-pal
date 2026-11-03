"use client";

import { useEffect, useMemo, useState } from "react";

import { leaderboard, suiteMetrics, formatMetric } from "@/lib/evals/compare";
import { GUIDES, type ChartSpec } from "@/lib/evals/guides";
import { SUITES } from "@/lib/evals/suites";
import type { EvalCase, EvalRunHeader, EvalSuiteListing } from "@/lib/evals/types";

import CaseDrawer from "./CaseDrawer";
import CaseMatrix from "./CaseMatrix";
import LeaderboardTable from "./LeaderboardTable";
import GroupBars from "./GroupBars";
import MetricBars from "./MetricBars";
import ScatterPlot from "./ScatterPlot";
import { ChartRow, SuiteIntro, SuiteReasons } from "./SuiteExplainer";
import { StatusPill, ago, clock } from "./evalUi";
import { useEvalRun, useEvalSuites } from "./useEvals";

/**
 * `/dev/evals` (#370): every eval suite on one page. The strip on top says
 * what is running and how far along; under it, one suite at a time — its
 * leaderboard, quality against cost, run history, and the cases of the run
 * picked there. A run that is writing fills in as it goes.
 */
export default function EvalsDashboard() {
	const { suites, error } = useEvalSuites();
	const [suiteId, setSuiteId] = useState<string>(SUITES[0].id);
	const [runIds, setRunIds] = useState<Record<string, string>>({});
	const [selected, setSelected] = useState<EvalCase | null>(null);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, []);

	const chooseSuite = (id: string) => {
		setSuiteId(id);
		setSelected(null);
	};

	const listing = suites?.find((s) => s.id === suiteId) ?? null;
	const guide = GUIDES[suiteId];
	const config = SUITES.find((s) => s.id === suiteId) ?? SUITES[0];
	const runs = useMemo(() => listing?.runs ?? [], [listing]);
	const rows = useMemo(() => leaderboard(runs), [runs]);
	const metrics = useMemo(() => suiteMetrics(runs), [runs]);
	const runId = runIds[suiteId] ?? runs[0]?.run_id ?? null;
	const header = runs.find((r) => r.run_id === runId) ?? null;
	const fetched = useEvalRun(suiteId, runId, header?.updated_at ?? null);
	const run = fetched && fetched.run_id === runId ? fetched : null;
	const xMetric = config.scatter && metrics.find((m) => m.key === config.scatter?.x);
	const yMetric = config.scatter && metrics.find((m) => m.key === config.scatter?.y);
	// The suite's cell metric once cases carry it (OCR pages before a reference
	// exists have only their timing), else the first metric the cases do carry.
	const cellMetric = useMemo(() => {
		if (!run) return undefined;
		const has = (key: string) => run.cases.some((c) => c.metrics[key] !== undefined);
		return run.metrics.find((m) => m.key === config.cellMetric && has(m.key)) ?? run.metrics.find((m) => has(m.key));
	}, [run, config.cellMetric]);

	const pickRun = (id: string) => {
		setRunIds((prev) => ({ ...prev, [suiteId]: id }));
		setSelected(null);
	};

	return (
		<main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-(--gutter) py-6 text-gp-ink">
			<header className="flex flex-col gap-1">
				<h1 className="m-0 font-display text-2xl font-semibold">Evals</h1>
				<p className="m-0 text-[13px] text-gp-ink-2">
					The runs of every eval suite, read from the result files in this checkout. A run that is writing updates here as its cases land.
				</p>
			</header>

			<details open className="rounded-md border border-gp-line bg-gp-card p-4 text-[13px] leading-relaxed">
				<summary className="cursor-pointer font-semibold text-gp-ink">这些评测和操作系统、存储有什么关系？（总的说明）</summary>
				<div className="mt-2 flex max-w-[90ch] flex-col gap-2 text-gp-ink">
					<p className="m-0">
						<strong>准确率类的数字（召回、通过率、忠实度……）和操作系统、硬盘基本无关</strong>：它们只取决于模型和输入。同一个模型读同一张图、回答同一个问题，在 macOS 和 Linux 上结果基本一样。
					</p>
					<p className="m-0">
						<strong>速度类的数字（秒/页、延迟）和机器强相关</strong>：本机 OCR 的速度取决于 CPU（这里是 Apple M2、8 核、macOS）和用了几个核；调云端模型的延迟主要取决于网络（国内走代理）和对方服务器。所以生产服务器（Linux、核数少）上要重新测速度。
					</p>
					<p className="m-0">
						<strong>花费只取决于 API 价格和 token 数</strong>，和机器无关；本机跑的模型花费是 0。
					</p>
					<p className="m-0">
						<strong>存储</strong>：评测的分数存成 JSON 文件放在仓库里（book-service/evals/*/results/、src/lib/assistant/__evals__/runs/），这个页面通过一个只在开发环境开放的接口（/api/dev/evals）从本机磁盘读它们——不经过数据库，也不经过 Supabase。书本内容（标准答案、OCR 读出的文字）有版权，只放在本机被 git 忽略的 materials/ 里，从不进仓库、不上网。运行中的评测每做完一题就整份重写一次结果文件（先写临时文件再改名，读的人不会读到写了一半的文件），页面每 2 秒读一次，所以能实时看到进度。
					</p>
				</div>
			</details>

			{error && <p className="m-0 text-[13px] text-gp-bad">Could not load the runs: {error}</p>}

			<nav aria-label="Suites" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
				{(suites ?? SUITES.map((s) => ({ ...s, runs: [] }) satisfies EvalSuiteListing)).map((s) => (
					<SuiteCard key={s.id} suite={s} active={s.id === suiteId} now={now} onClick={() => chooseSuite(s.id)} />
				))}
			</nav>

			{suites === null ? (
				<p className="text-[13px] text-gp-ink-3">Loading runs…</p>
			) : runs.length === 0 ? (
				<p className="text-[13px] text-gp-ink-3">No runs for {config.title} yet. {config.description}</p>
			) : (
				<section className="flex flex-col gap-5" aria-label={config.title}>
					{guide ? <SuiteIntro guide={guide} /> : <p className="m-0 max-w-[80ch] text-[13px] text-gp-ink-2">{config.description}</p>}

					<Findings runs={runs} onPick={pickRun} />

					{guide ? (
						<div className="flex flex-col gap-3">
							<h2 className="m-0 text-[15px] font-semibold">图</h2>
							{guide.charts.map((chart) => (
								<SuiteChart key={`${chart.kind}-${chart.title}`} chart={chart} rows={rows} metrics={metrics} today={guide.today} groupNames={guide.groupNames} />
							))}
						</div>
					) : (
						xMetric && yMetric && <ScatterPlot subjects={rows.map((r) => r.subject)} x={xMetric} y={yMetric} />
					)}

					{guide && <SuiteReasons guide={guide} />}

					<div className="flex flex-col gap-2">
						<h2 className="m-0 text-[15px] font-semibold">全部数字</h2>
						<LeaderboardTable rows={rows} metrics={metrics} selectedRunId={runId} onSelectRun={pickRun} />
					</div>

					<RunHistory runs={runs} selected={runId} now={now} onPick={pickRun} />

					{run && run.cases.length > 0 && (
						<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
							<div className="flex min-w-0 flex-col gap-2">
								<h2 className="m-0 text-[15px] font-semibold">
									Cases <span className="font-mono text-[12px] font-normal text-gp-ink-3">{run.run_id}</span>
									{cellMetric && !run.cases.some((c) => c.pass !== undefined) && (
										<span className="ml-2 text-[12px] font-normal text-gp-ink-3">cells show {cellMetric.label}</span>
									)}
								</h2>
								<CaseMatrix run={run} cellMetric={cellMetric} selected={selected} onSelect={setSelected} />
							</div>
							<div className="min-w-0">
								{selected ? (
									<CaseDrawer run={run} selected={selected} onClose={() => setSelected(null)} />
								) : (
									<p className="m-0 rounded-md border border-dashed border-gp-line p-4 text-[12.5px] text-gp-ink-3">
										Pick a cell to see the case: its numbers, what failed, and what was asked.
									</p>
								)}
							</div>
						</div>
					)}
				</section>
			)}
		</main>
	);
}

function SuiteCard({ suite, active, now, onClick }: { suite: EvalSuiteListing; active: boolean; now: number; onClick: () => void }) {
	const latest = suite.runs[0];
	const config = SUITES.find((s) => s.id === suite.id);
	// The best subject across the suite's runs (each from its newest run), not
	// just the newest run — which may be half done.
	const rows = leaderboard(suite.runs);
	const primary = suiteMetrics(suite.runs).find((m) => m.key === config?.primary);
	const candidates = primary ? rows.map((r) => r.subject).filter((s) => s.summary[primary.key] !== undefined) : [];
	const best = primary
		? candidates.reduce<(typeof candidates)[number] | undefined>(
				(top, s) =>
					!top || (primary.direction === "higher" ? s.summary[primary.key] > top.summary[primary.key] : s.summary[primary.key] < top.summary[primary.key]) ? s : top,
				undefined,
			)
		: undefined;
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={`flex flex-col gap-1.5 rounded-md border p-3 text-left transition-colors duration-(--dur-hover) ${
				active ? "border-gp-tab-500 bg-gp-tab-100" : "border-gp-line bg-gp-card hover:border-gp-edge"
			}`}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="font-semibold">{suite.title}</span>
				{latest && <StatusPill status={latest.status} />}
			</div>
			{latest ? <RunLine run={latest} now={now} /> : <span className="text-[12px] text-gp-ink-3">No runs yet</span>}
			{GUIDES[suite.id] ? (
				<span className="text-[12.5px] font-medium leading-snug text-gp-ink">{GUIDES[suite.id].headline}</span>
			) : best && primary && (
				<span className="text-[12px] text-gp-ink-2">
					Best {primary.label}: <span className="font-medium text-gp-ink">{best.label}</span>{" "}
					<span className="font-mono tabular-nums">{formatMetric(best.summary[primary.key], primary)}</span>
				</span>
			)}
		</button>
	);
}

/** Progress and timing: "37/182 · 4:07 elapsed · ~16:20 left" while running. */
function RunLine({ run, now }: { run: EvalRunHeader; now: number }) {
	const started = Date.parse(run.started_at ?? "");
	if (run.status === "running" && run.progress && !Number.isNaN(started)) {
		const { done, total } = run.progress;
		const elapsed = (now - started) / 1000;
		const left = done > 0 ? (elapsed / done) * (total - done) : null;
		const current = run.subjects.find((s) => s.status === "running" || s.status === "loading");
		return (
			<span className="flex flex-col gap-1">
				<span className="h-1 w-full overflow-hidden rounded-full bg-gp-line" aria-hidden>
					<span className="block h-full bg-gp-tab-500 transition-[width] duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
				</span>
				<span className="font-mono text-[11px] text-gp-ink-2">
					{done}/{total} · {clock(elapsed)} elapsed{left !== null ? ` · ~${clock(left)} left` : ""}
					{current ? ` · ${current.label}` : ""}
				</span>
			</span>
		);
	}
	return (
		<span className="font-mono text-[11px] text-gp-ink-3">
			{run.run_id} · {ago(run.finished_at ?? run.started_at ?? run.updated_at, now)}
			{run.legacy ? " · baseline file" : ""}
		</span>
	);
}

/** One chart from a suite guide, with its notes beside it. */
function SuiteChart({
	chart,
	rows,
	metrics,
	today,
	groupNames,
}: {
	chart: ChartSpec;
	rows: ReturnType<typeof leaderboard>;
	metrics: ReturnType<typeof suiteMetrics>;
	today?: string;
	groupNames?: Record<string, string>;
}) {
	const subjects = rows.map((r) => r.subject);
	const find = (key: string) => metrics.find((m) => m.key === key);
	let body: React.ReactNode = null;
	if (chart.kind === "bars") {
		const metric = find(chart.metric);
		if (metric) body = <MetricBars subjects={subjects} metric={metric} today={today} />;
	} else if (chart.kind === "scatter") {
		const x = find(chart.x);
		const y = find(chart.y);
		if (x && y) body = <ScatterPlot subjects={subjects} x={x} y={y} caption={false} />;
	} else {
		const metric = find(chart.metric);
		const chosen = chart.subjects.map((id) => subjects.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => s !== undefined);
		if (metric) body = <GroupBars subjects={chosen} metric={metric} groupNames={groupNames} />;
	}
	if (!body) return null;
	return (
		<ChartRow title={chart.title} note={chart.note}>
			{body}
		</ChartRow>
	);
}

const ISSUE_URL = "https://github.com/SloanWan/guitar-pal/issues/";

/** The read-outs written into runs, newest first: what each run showed, in words. */
function Findings({ runs, onPick }: { runs: EvalRunHeader[]; onPick: (id: string) => void }) {
	const withFindings = runs.filter((r) => (r.findings_zh ?? r.findings ?? []).length > 0);
	if (withFindings.length === 0) return null;
	return (
		<div className="flex flex-col gap-3">
			<h2 className="m-0 text-[15px] font-semibold">结论（每次运行看出来什么）</h2>
			{withFindings.map((r) => (
				<div key={r.run_id} className="flex flex-col gap-2 rounded-md border border-gp-line bg-gp-card p-4">
					<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-gp-ink-3">
						{r.issue && (
							<a href={`${ISSUE_URL}${r.issue}`} target="_blank" rel="noreferrer" className="font-mono text-gp-tab-500 underline-offset-2 hover:underline">
								#{r.issue}
							</a>
						)}
						<button type="button" onClick={() => onPick(r.run_id)} className="font-mono hover:text-gp-ink">
							{r.run_id}
						</button>
						<span>{r.title}</span>
					</div>
					<ul className="m-0 flex max-w-[90ch] list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-gp-ink">
						{(r.findings_zh ?? r.findings ?? []).map((f) => (
							<li key={f}>{f}</li>
						))}
					</ul>
				</div>
			))}
		</div>
	);
}

function RunHistory({ runs, selected, now, onPick }: { runs: EvalRunHeader[]; selected: string | null; now: number; onPick: (id: string) => void }) {
	return (
		<div className="flex flex-col gap-2">
			<h2 className="m-0 text-[15px] font-semibold">Runs</h2>
			<div className="overflow-x-auto rounded-md border border-gp-line bg-gp-card">
				<table className="w-full border-collapse text-[12.5px]">
					<thead>
						<tr className="border-b border-gp-line text-left font-mono text-[10.5px] uppercase tracking-[0.06em] text-gp-ink-3">
							<th className="px-3 py-2 font-normal">Run</th>
							<th className="px-3 py-2 font-normal">Status</th>
							<th className="px-3 py-2 font-normal">Started</th>
							<th className="px-3 py-2 font-normal">Subjects</th>
							<th className="px-3 py-2 text-right font-normal">Cases</th>
							<th className="px-3 py-2 font-normal">Commit</th>
						</tr>
					</thead>
					<tbody>
						{runs.map((r) => (
							<tr
								key={r.run_id}
								onClick={() => onPick(r.run_id)}
								className={`cursor-pointer border-b border-gp-line last:border-b-0 hover:bg-gp-page ${r.run_id === selected ? "bg-gp-tab-100" : ""}`}
							>
								<td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11.5px]">
									<button type="button" onClick={() => onPick(r.run_id)} className="text-left">
										{r.run_id}
									</button>
									{r.legacy && <span className="ml-2 text-gp-ink-3">baseline file</span>}
								</td>
								<td className="px-3 py-1.5">
									<StatusPill status={r.status} />
								</td>
								<td className="whitespace-nowrap px-3 py-1.5 text-gp-ink-2">{ago(r.started_at ?? r.updated_at, now)}</td>
								<td className="px-3 py-1.5 text-gp-ink-2">{r.subjects.map((s) => s.label).join(", ")}</td>
								<td className="px-3 py-1.5 text-right font-mono tabular-nums text-gp-ink-2">
									{r.progress ? `${r.progress.done}/${r.progress.total}` : r.case_count}
								</td>
								<td className="px-3 py-1.5 font-mono text-[11.5px] text-gp-ink-3">{r.git_sha ?? "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
