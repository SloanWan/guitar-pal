/**
 * DEV-ONLY docs page — /dev/tab-import-validation
 *
 * A static, browser-viewable flowchart of the Tab-Import validation pipeline
 * (src/lib/tabImport/). Not wired into any feature — it exists purely as living
 * documentation so the "repair, don't reject" validation flow can be read at a
 * glance. Static server component: no hooks, no interactivity.
 */

import type { ReactNode } from "react";

// ── Small presentational primitives ─────────────────────────────────────────

type Tone = "neutral" | "denim" | "error" | "warn" | "ok";

const TONE_BOX: Record<Tone, string> = {
	neutral: "bg-panel border-line text-ink",
	denim: "bg-denim text-on-denim border-denim",
	error: "border-destructive text-destructive bg-destructive/5",
	warn: "border-favorite-active text-ink bg-favorite-active/10",
	ok: "border-emerald-500 text-ink bg-emerald-500/10",
};

function Box({
	children,
	tone = "neutral",
	className = "",
}: {
	children: ReactNode;
	tone?: Tone;
	className?: string;
}) {
	return (
		<div
			className={`rounded-md border px-4 py-3 text-sm leading-relaxed shadow-sm ${TONE_BOX[tone]} ${className}`}
		>
			{children}
		</div>
	);
}

/** Vertical connector with a downward chevron. */
function Down({ label }: { label?: string }) {
	return (
		<div className="flex flex-col items-center py-1 text-ink-faint">
			<div className="h-4 w-px bg-line-strong" />
			{label ? (
				<span className="my-0.5 rounded bg-panel px-2 py-0.5 text-xs text-ink-dim">
					{label}
				</span>
			) : null}
			<div className="text-xs leading-none">▼</div>
		</div>
	);
}

/** Decision diamond rendered as a labelled pill with two labelled exits. */
function Gate({
	question,
	yes,
	no,
}: {
	question: string;
	yes: string;
	no: string;
}) {
	return (
		<div className="flex flex-col items-center gap-2">
			<div className="rounded-full border border-denim bg-denim-tint px-5 py-2 text-center text-sm font-medium text-denim-accent">
				◇ {question}
			</div>
			<div className="grid w-full grid-cols-2 gap-3 text-xs">
				<div className="flex flex-col items-center rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-center text-destructive">
					<span className="font-semibold">是 → {yes}</span>
				</div>
				<div className="flex flex-col items-center rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-center text-ink">
					<span className="font-semibold">否 → {no}</span>
				</div>
			</div>
		</div>
	);
}

function Code({ children }: { children: ReactNode }) {
	return (
		<code className="rounded bg-line/40 px-1.5 py-0.5 font-mono text-[0.8em] text-denim-accent">
			{children}
		</code>
	);
}

function SectionTitle({ n, title }: { n: string; title: string }) {
	return (
		<h2 className="mt-14 mb-5 flex items-center gap-3 text-xl font-semibold text-ink">
			<span className="flex h-8 w-8 items-center justify-center rounded-full bg-denim text-sm text-on-denim">
				{n}
			</span>
			{title}
		</h2>
	);
}

// ── Layer card used in the drill-down ───────────────────────────────────────

function Layer({
	idx,
	title,
	subtitle,
	fn,
	errors,
	warnings,
	notes,
}: {
	idx: number;
	title: string;
	subtitle: string;
	fn: string;
	errors?: { code: string; when: string }[];
	warnings?: { code: string; when: string }[];
	notes?: ReactNode;
}) {
	return (
		<div className="rounded-lg border border-line bg-panel p-4">
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<div>
					<div className="text-xs text-ink-faint">第 {idx} 层</div>
					<div className="text-base font-semibold text-ink">{title}</div>
					<div className="text-xs text-ink-dim">{subtitle}</div>
				</div>
				<Code>{fn}</Code>
			</div>

			{errors && errors.length > 0 ? (
				<div className="mb-2">
					<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-destructive">
						致命错误 → 返回 null
					</div>
					<ul className="space-y-1">
						{errors.map((e) => (
							<li key={e.code} className="flex flex-wrap items-center gap-2 text-xs">
								<span className="rounded border border-destructive/50 bg-destructive/5 px-1.5 py-0.5 font-mono text-destructive">
									{e.code}
								</span>
								<span className="text-ink-dim">{e.when}</span>
							</li>
						))}
					</ul>
				</div>
			) : null}

			{warnings && warnings.length > 0 ? (
				<div>
					<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-favorite-active">
						修复 + 警告（继续）
					</div>
					<ul className="space-y-1">
						{warnings.map((w) => (
							<li key={w.code} className="flex flex-wrap items-center gap-2 text-xs">
								<span className="rounded border border-favorite-active/50 bg-favorite-active/10 px-1.5 py-0.5 font-mono text-ink">
									{w.code}
								</span>
								<span className="text-ink-dim">{w.when}</span>
							</li>
						))}
					</ul>
				</div>
			) : null}

			{notes ? <div className="mt-3 text-xs text-ink-dim">{notes}</div> : null}
		</div>
	);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TabImportValidationPage() {
	return (
		<div className="mx-auto max-w-4xl px-6 py-12 text-ink">
			<header className="mb-8">
				<div className="text-xs font-medium uppercase tracking-widest text-denim-accent">
					DEV · 文档
				</div>
				<h1 className="mt-1 text-3xl font-bold">Tab 导入 · 验证流程图</h1>
				<p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim">
					<Code>src/lib/tabImport/</Code> 的验证管线。核心哲学是
					<b className="text-ink">「修复式，而非拒绝式」（repair, don&apos;t reject）</b>
					：只有结构性根本无法使用时才报 <b className="text-destructive">error</b> 并返回{" "}
					<Code>null</Code>；其余所有字段级问题一律「就地修复 + 记一条{" "}
					<b className="text-favorite-active">warning</b>」，保证最终一定产出可渲染、可播放的合法 pattern。
				</p>
			</header>

			{/* Legend */}
			<div className="flex flex-wrap gap-3 rounded-lg border border-line bg-panel p-4 text-xs">
				<span className="flex items-center gap-2">
					<span className="inline-block h-3 w-3 rounded-sm border border-destructive bg-destructive/20" />
					error — 致命，返回 <Code>null</Code>，流程终止
				</span>
				<span className="flex items-center gap-2">
					<span className="inline-block h-3 w-3 rounded-sm border border-favorite-active bg-favorite-active/30" />
					warning — 已修复，附一条 <Code>ValidationIssue</Code>
				</span>
				<span className="flex items-center gap-2">
					<span className="inline-block h-3 w-3 rounded-sm border border-denim bg-denim-tint" />
					决策 / 分支
				</span>
			</div>

			{/* ── Section 1: overall pipeline ─────────────────────────────── */}
			<SectionTitle n="总" title="整体管线 · normalizeImportedPattern()" />
			<p className="mb-5 text-sm text-ink-dim">
				对外入口是 <Code>normalizeImportedPattern(raw, repeats)</Code>；validation
				只是它的第一步。
			</p>

			<div className="mx-auto flex max-w-md flex-col">
				<Box tone="neutral">
					<div className="font-medium">输入 raw（unknown）</div>
					<div className="text-xs text-ink-dim">未知来源，可能来自图片 OCR / JSON</div>
				</Box>
				<Down />
				<Box tone="denim">
					<div className="font-semibold">① validateFingerpickPattern(raw)</div>
					<div className="text-xs opacity-90">
						逐层下钻校验 → 产出 <span className="font-mono">{"{ pattern, errors, warnings }"}</span>
					</div>
				</Box>
				<Down />
				<Gate question="pattern === null ?" yes="立即 return（带 errors）" no="继续" />
				<Down />
				<Box tone="neutral">
					<div className="font-semibold">② expandRepeats(measures, repeats)</div>
					<div className="text-xs text-ink-dim">
						展开反复记号；校验越界 / 重叠指令，追加 warnings
					</div>
				</Box>
				<Down />
				<Box tone="neutral">
					<div className="font-semibold">③ capMeasures(expanded)</div>
					<div className="text-xs text-ink-dim">
						超过 <Code>MAX_MEASURES = 128</Code> 则截断，置 <Code>truncated</Code>
					</div>
				</Box>
				<Down />
				<Box tone="ok">
					<div className="font-semibold">返回 · NormalizeResult</div>
					<div className="font-mono text-xs">
						{"{ pattern, errors, warnings, truncated }"}
					</div>
				</Box>
			</div>

			{/* ── Section 2: the drill-down ───────────────────────────────── */}
			<SectionTitle n="①" title="validateFingerpickPattern 的逐层验证" />
			<p className="mb-5 text-sm text-ink-dim">
				一个自顶向下的下钻结构：
				<b className="text-ink"> Pattern → Measure → Slot → Strings → StringFret</b>
				。只有<b className="text-destructive">最外层 Pattern</b>会产生 error；越往里越细，全部是「修复 + 警告」。
			</p>

			<div className="space-y-3">
				<Layer
					idx={1}
					title="Pattern（顶层）"
					subtitle="唯一会产生 error 的层"
					fn="validateFingerpickPattern:276"
					errors={[
						{ code: "NOT_AN_OBJECT", when: "raw 不是对象" },
						{ code: "MEASURES_NOT_ARRAY", when: "measures 字段不是数组" },
						{ code: "ZERO_MEASURES", when: "measures 是空数组" },
					]}
					warnings={[
						{ code: "INVALID_BPM", when: "bpm 非正/非有限 → 默认 80" },
						{
							code: "INVALID_TIME_SIGNATURE",
							when: "拍号非法 → 默认 [4, 4]",
						},
					]}
					notes={
						<>
							通过 3 个致命检查后处理元数据（<Code>id</Code>/<Code>name</Code> 缺失静默兜底）。
							<b className="text-ink"> 关键约束</b>：必须用 <Code>.map()</Code> 保留原始小节数量 —
							因为 repeat 指令按原始索引引用，绝不能在此删减小节。
						</>
					}
				/>
				<Down />
				<Layer
					idx={2}
					title="Measure（小节）"
					subtitle="含「统一时值推断」特殊逻辑"
					fn="validateMeasure:221"
					warnings={[
						{ code: "INVALID_MEASURE", when: "不是对象 → 替换为休止小节" },
						{ code: "EMPTY_SLOTS", when: "slots 缺失/为空 → 插入休止 slot" },
						{
							code: "UNIFORM_DURATION_ASSIGNED",
							when: "全部 slot 都无合法时值（OCR 图片场景）→ 按拍号容量÷slot数 反推统一时值",
						},
					]}
					notes={
						<>
							时值换算用「32 分音符 = 1 tick」的整数体系（<Code>DURATION_TICKS</Code> /{" "}
							<Code>measureCapacityTicks</Code>），避免浮点误差。
						</>
					}
				/>
				<Down />
				<Layer
					idx={3}
					title="Slot（拍位）"
					subtitle="时值决策优先级"
					fn="validateSlot:175"
					warnings={[
						{ code: "INVALID_SLOT", when: "不是对象 → 换成默认 slot" },
						{
							code: "INVALID_DURATION",
							when: "无统一时值且自身时值非法 → 默认 eighth",
						},
					]}
					notes={
						<>
							时值优先级：<b className="text-ink">① 上层统一时值</b> →{" "}
							<b className="text-ink">② 自身合法 duration</b> →{" "}
							<b className="text-ink">③ 默认 &quot;eighth&quot;</b>。
						</>
					}
				/>
				<Down />
				<Layer
					idx={4}
					title="Strings（六弦数组）"
					subtitle="吉他固定 6 弦"
					fn="validateStrings:149"
					warnings={[
						{
							code: "INVALID_STRINGS_TUPLE",
							when: "不是长度 6 的数组 → 强制补齐/截断为 6（缺的填静音弦）",
						},
					]}
				/>
				<Down />
				<Layer
					idx={5}
					title="StringFret（单弦最细粒度）"
					subtitle="fret 夹取 + technique 双重检查"
					fn="validateStringFret:79"
					warnings={[
						{
							code: "FRET_CLAMPED",
							when: "品位数字超出 [0, 24] → 夹取到区间内",
						},
						{
							code: "UNSUPPORTED_TECHNIQUE",
							when: "已知但渲染不支持的技巧（bend/harmonic 等）→ 丢弃置 null",
						},
					]}
					notes={
						<>
							<b className="text-ink">technique 双重检查</b>：① 先查是否为 21 种{" "}
							<Code>ALL_TECHNIQUES</Code> 之一（未知 → 静默置 null）；② 已知再查{" "}
							<Code>techniqueSupport.ts</Code> 的 <Code>renderSupported</Code>，不支持才警告丢弃 —
							目的是保证结果一定能被 VexFlow 渲染。非数字 fret / 非法修饰字段静默忽略，遵循「畸形 → 静默默认值」。
						</>
					}
				/>
			</div>

			{/* ── Section 3: expandRepeats ────────────────────────────────── */}
			<SectionTitle n="②" title="expandRepeats · 展开反复记号" />
			<div className="grid gap-3 sm:grid-cols-3">
				<Box tone="neutral" className="text-xs">
					<div className="mb-1 font-semibold">1. 逐条校验</div>
					按起点排序，剔除越界 / 非整数 / <Code>times</Code> 超过{" "}
					<Code>MAX_REPEAT_TIMES=128</Code> 的指令
					<div className="mt-2">
						<span className="rounded border border-favorite-active/50 bg-favorite-active/10 px-1.5 py-0.5 font-mono text-[11px]">
							INVALID_REPEAT_DIRECTIVE
						</span>
					</div>
				</Box>
				<Box tone="neutral" className="text-xs">
					<div className="mb-1 font-semibold">2. 去重叠</div>
					与已接受指令重叠则跳过（保留先出现的）
					<div className="mt-2">
						<span className="rounded border border-favorite-active/50 bg-favorite-active/10 px-1.5 py-0.5 font-mono text-[11px]">
							OVERLAPPING_REPEAT_DIRECTIVE
						</span>
					</div>
				</Box>
				<Box tone="neutral" className="text-xs">
					<div className="mb-1 font-semibold">3. 从后往前插入</div>
					逆序插入拷贝，避免索引位移；每份拷贝用{" "}
					<Code>crypto.randomUUID()</Code> 生成全新 id，防止 React key 冲突
				</Box>
			</div>

			{/* ── Section 4: capMeasures ──────────────────────────────────── */}
			<SectionTitle n="③" title="capMeasures · 长度封顶" />
			<Box tone="neutral" className="text-sm">
				展开后若超过 <Code>MAX_MEASURES = 128</Code>，<Code>slice(0, 128)</Code>{" "}
				截断并置 <Code>truncated: true</Code>，由 <Code>normalizeImportedPattern</Code>{" "}
				补一条{" "}
				<span className="rounded border border-favorite-active/50 bg-favorite-active/10 px-1.5 py-0.5 font-mono text-xs">
					MEASURES_TRUNCATED
				</span>{" "}
				警告。
			</Box>

			{/* ── Summary ─────────────────────────────────────────────────── */}
			<SectionTitle n="总" title="一句话总结" />
			<Box tone="denim" className="text-sm leading-relaxed">
				只有「不是对象 / measures 不是数组 / measures 为空」这三种情况会致命报错返回{" "}
				<span className="font-mono">null</span>
				；其余所有问题——坏时值、越界品位、错误弦数、不支持的技巧、非法反复、超长——
				全部就地修复并记一条 warning，保证最终一定产出一个可渲染、可播放的合法 pattern。
			</Box>

			<footer className="mt-12 border-t border-line pt-4 text-xs text-ink-faint">
				来源文件：<Code>validateFingerpickPattern.ts</Code> ·{" "}
				<Code>normalizeImportedPattern.ts</Code> · <Code>expandRepeats.ts</Code> ·{" "}
				<Code>capMeasures.ts</Code> · <Code>techniqueSupport.ts</Code>
			</footer>
		</div>
	);
}
