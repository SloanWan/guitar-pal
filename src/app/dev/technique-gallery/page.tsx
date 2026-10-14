"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import TabStaveRow, { CLEF_WIDTH, computeMeasureMinWidth } from "@/components/fingerpick/TabStaveRow";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import { hoPoConnectorCount } from "@/components/fingerpick/fingerpickLayout";
import { indexPattern } from "@/lib/fingerpickIndex";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import type { TechniqueCategory } from "@/lib/techniqueRegistry";

import { TECHNIQUE_DEMOS, type TechniqueDemo } from "./demos";

// ── Layout ───────────────────────────────────────────────────────────────────
const ROW_TRAILING_PAD = 15;

type Lang = "en" | "zh";
const bi = (lang: Lang, en: string, zh: string) => (lang === "en" ? en : zh);

const CATEGORY_LABEL: Record<TechniqueCategory, { en: string; zh: string }> = {
	link: { en: "Links — how the note is reached", zh: "连接 — 音是怎么到达的" },
	effect: { en: "Effects — what is done to the note", zh: "效果 — 对音做了什么" },
	span: { en: "Spans — over a run of notes", zh: "跨音记号 — 覆盖一段音" },
	slot: { en: "Hits — on the slot", zh: "右手击打 — 落在时值格上" },
};
const CATEGORY_ORDER: TechniqueCategory[] = ["link", "effect", "span", "slot"];

/** One demo: its registry row, a stave, and a play button on the shared engine. */
function DemoCard({
	demo,
	lang,
	width,
	playing,
	canPlay,
	onPlay,
	onStop,
}: {
	demo: TechniqueDemo;
	lang: Lang;
	width: number;
	playing: boolean;
	canPlay: boolean;
	onPlay: () => void;
	onStop: () => void;
}) {
	const { def, pattern } = demo;
	const renderContext = useMemo(() => ({ index: indexPattern(pattern) }), [pattern]);
	const measure = pattern.measures[0];
	// One measure a card: it takes the whole row, no narrower than its own minimum.
	const measureWidth = useMemo(() => {
		if (width === 0) return 0;
		const rd = fingerpickToVexFlow(measure, renderContext);
		const min = computeMeasureMinWidth(rd.notes, true, hoPoConnectorCount(measure), 0, 0, 0, rd.rolls.length, [], rd.expression);
		return Math.max(min, width - CLEF_WIDTH - ROW_TRAILING_PAD);
	}, [measure, renderContext, width]);
	const ascii = def.ascii
		? Object.entries(def.ascii)
				.map(([where, mark]) => `${where}: ${mark}`)
				.join(" · ")
		: "—";

	return (
		<li className={`border border-line bg-panel p-4 ${playing ? "ring-1 ring-denim" : ""}`}>
			<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<span className="font-mono text-[13px] font-semibold text-denim-accent">{def.kind}</span>
				<span className="font-sans text-[14px] text-ink">{bi(lang, def.label.en, def.label.zh)}</span>
				<span className="font-mono text-[12px] text-ink-dim" title="glyph">
					{def.glyph}
				</span>
				{def.key && (
					<span className="font-mono text-[11px] text-ink-faint" title="editor key">
						key {def.key}
					</span>
				)}
				<span className="ml-auto flex items-center gap-2 font-mono text-[11px]">
					<span className={def.render ? "text-denim" : "text-ink-faint"} title="the converter draws it">
						{def.render ? "✓" : "–"} render
					</span>
					<span className={def.audio ? "text-denim" : "text-ink-faint"} title="the scheduler voices it">
						{def.audio ? "✓" : "–"} audio
					</span>
					<button
						type="button"
						onClick={playing ? onStop : onPlay}
						disabled={!canPlay}
						aria-label={playing ? `Stop ${def.kind}` : `Play ${def.kind}`}
						className={`h-7 min-w-16 border px-3 font-mono text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
							playing ? "border-denim bg-denim text-on-denim" : "border-line-strong text-ink-dim hover:bg-denim-tint hover:text-denim"
						}`}
					>
						{playing ? "■ Stop" : "▶ Play"}
					</button>
				</span>
			</div>
			<p className="mt-1 font-sans text-[12px] text-ink-dim">{bi(lang, demo.note.en, demo.note.zh)}</p>
			<p className="mt-0.5 font-mono text-[10px] text-ink-faint">ascii {ascii}</p>
			<div className="mt-2 overflow-hidden">
				{measureWidth > 0 && (
					<TabStaveRow
						measures={pattern.measures}
						timeSignature={pattern.timeSignature}
						measureWidths={[measureWidth]}
						renderContext={renderContext}
					/>
				)}
			</div>
		</li>
	);
}

export default function TechniqueGalleryPage() {
	const [lang, setLang] = useState<Lang>("en");
	const engine = useFingerpickAudioEngine();
	const { isLoaded, isPlaying } = engine;
	const [activeKind, setActiveKind] = useState<string | null>(null);

	useEffect(() => {
		void engine.load();
		// Load once on mount; the engine's identity is stable for the page's life.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const containerRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const obs = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setWidth(Math.floor(entry.contentRect.width));
		});
		obs.observe(el);
		return () => obs.disconnect();
	}, []);

	function play(demo: TechniqueDemo) {
		engine.stop();
		engine.setPlayOnce(true);
		setActiveKind(demo.def.kind);
		engine.play(demo.pattern, { loop: false });
	}
	function stop() {
		engine.stop();
		setActiveKind(null);
	}

	const groups = useMemo(
		() => CATEGORY_ORDER.map((category) => ({ category, demos: TECHNIQUE_DEMOS.filter((d) => d.def.category === category) })),
		[],
	);

	return (
		<div className="min-h-screen bg-surface px-(--gutter) py-10 text-ink">
			<header className="pb-6">
				<div className="font-mono text-[11px] uppercase tracking-[0.18em] text-denim-accent">{"// DEV — TECHNIQUE GALLERY"}</div>
				<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
					<h1 className="font-mono font-bold text-ink" style={{ fontSize: "clamp(24px, 3.5vw, 40px)" }}>
						{bi(lang, "Every technique the registry knows", "注册表里的每一种技巧")}
					</h1>
					<div className="flex items-center gap-2">
						{!isLoaded && <span className="font-mono text-[11px] text-ink-faint">{bi(lang, "loading samples…", "采样加载中…")}</span>}
						<button
							type="button"
							onClick={() => setLang((l) => (l === "en" ? "zh" : "en"))}
							className="h-7 border border-line-strong px-3 font-mono text-[11px] text-ink-dim hover:bg-denim-tint hover:text-denim"
						>
							{lang === "en" ? "中文" : "English"}
						</button>
					</div>
				</div>
				<p className="mt-3 max-w-[70ch] font-sans text-[13px] text-ink-dim">
					{bi(
						lang,
						"One bar per kind, built from techniqueRegistry.ts: the stave shows what the converter draws, Play what the scheduler voices. The render / audio marks are the registry's flags, which the test suite ties to the converter's and scheduler's handler tables.",
						"每种技巧一小节，由 techniqueRegistry.ts 生成：谱面是转换器画出的样子，Play 是调度器发出的声音。render / audio 标记来自注册表，测试会把它们与转换器、调度器的处理表对上。",
					)}
				</p>
			</header>

			<div ref={containerRef}>
				{groups.map(({ category, demos }) => (
					<section key={category} className="mb-10">
						<h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
							{bi(lang, CATEGORY_LABEL[category].en, CATEGORY_LABEL[category].zh)}
						</h2>
						<ul className="flex flex-col gap-3">
							{demos.map((demo) => (
								<DemoCard
									key={demo.def.kind}
									demo={demo}
									lang={lang}
									width={width}
									// A play-once pass ends on its own: the button follows the engine, not the click.
									playing={isPlaying && activeKind === demo.def.kind}
									canPlay={isLoaded}
									onPlay={() => play(demo)}
									onStop={stop}
								/>
							))}
						</ul>
					</section>
				))}
			</div>
		</div>
	);
}
