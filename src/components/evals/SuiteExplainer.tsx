"use client";

import type { ReactNode } from "react";

import type { Cause, SuiteGuide } from "@/lib/evals/guides";

const VERDICT_STYLE: Record<Cause["verdict"], string> = {
	好: "bg-gp-tab-100 text-gp-tab-500",
	差: "bg-gp-bad/15 text-gp-bad",
	一般: "bg-gp-page text-gp-ink-2 border border-gp-line",
};

function Block({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex min-w-0 flex-col gap-2 rounded-md border border-gp-line bg-gp-card p-4">
			<h3 className="m-0 text-[14px] font-semibold text-gp-ink">{title}</h3>
			{children}
		</section>
	);
}

function Paragraphs({ items }: { items: string[] }) {
	return (
		<div className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-gp-ink">
			{items.map((t) => (
				<p key={t} className="m-0">
					{t}
				</p>
			))}
		</div>
	);
}

/** The suite in words: the question, why, how, how to read each number. */
export function SuiteIntro({ guide }: { guide: SuiteGuide }) {
	return (
		<div className="flex flex-col gap-3">
			<p className="m-0 max-w-[80ch] text-[16px] font-medium leading-relaxed text-gp-ink">{guide.question}</p>
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<Block title="为什么要测">
					<Paragraphs items={guide.why} />
				</Block>
				<Block title="怎么测的">
					<ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-[13.5px] leading-relaxed text-gp-ink">
						{guide.how.map((t) => (
							<li key={t}>{t}</li>
						))}
					</ol>
				</Block>
			</div>
			<Block title="每个指标怎么读">
				<dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2.5 md:grid-cols-2">
					{guide.metrics.map((m) => (
						<div key={m.key} className="flex min-w-0 flex-col gap-0.5">
							<dt className="text-[13px] font-semibold text-gp-ink">{m.name}</dt>
							<dd className="m-0 text-[13px] leading-relaxed text-gp-ink-2">{m.means}</dd>
						</div>
					))}
				</dl>
			</Block>
		</div>
	);
}

/** Why each technique or model did well or badly, then what depends on the machine, then the limits. */
export function SuiteReasons({ guide }: { guide: SuiteGuide }) {
	return (
		<div className="flex flex-col gap-3">
			<Block title="为什么会这样：每项技术 / 模型好在哪、差在哪">
				<ul className="m-0 flex list-none flex-col gap-3 p-0">
					{guide.causes.map((c) => (
						<li key={c.who} className="flex flex-col gap-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className={`rounded-full px-2 py-px text-[11.5px] font-semibold ${VERDICT_STYLE[c.verdict]}`}>{c.verdict}</span>
								<span className="text-[13.5px] font-semibold text-gp-ink">{c.who}</span>
							</div>
							<p className="m-0 text-[13.5px] leading-relaxed text-gp-ink-2">{c.because}</p>
						</li>
					))}
				</ul>
			</Block>
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<Block title="和操作系统 / 机器 / 存储有没有关系">
					<ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-gp-ink">
						{guide.environment.map((t) => (
							<li key={t}>{t}</li>
						))}
					</ul>
				</Block>
				<Block title="局限：这些数字不能说明什么">
					<ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-gp-ink">
						{guide.limits.map((t) => (
							<li key={t}>{t}</li>
						))}
					</ul>
				</Block>
			</div>
		</div>
	);
}

/** A chart with its reading notes beside it (below it on a narrow screen). */
export function ChartRow({ title, note, children }: { title: string; note: string[]; children: ReactNode }) {
	return (
		<section className="grid grid-cols-1 gap-4 rounded-md border border-gp-line bg-gp-card p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
			<div className="flex min-w-0 flex-col gap-2">
				<h3 className="m-0 text-[14px] font-semibold text-gp-ink">{title}</h3>
				{children}
			</div>
			<aside className="flex flex-col gap-2 border-gp-line text-[13px] leading-relaxed text-gp-ink lg:border-l lg:pl-4">
				<span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-gp-ink-3">怎么看这张图</span>
				{note.map((t) => (
					<p key={t} className="m-0">
						{t}
					</p>
				))}
			</aside>
		</section>
	);
}
