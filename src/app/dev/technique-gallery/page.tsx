"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import TabStaveRow, { CLEF_WIDTH, computeMeasureMinWidth } from "@/components/fingerpick/TabStaveRow";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import { hoPoConnectorCount } from "@/components/fingerpick/fingerpickLayout";
import { indexPattern } from "@/lib/fingerpickIndex";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import { FINGERPICK_SCHEMA_VERSION, type FingerpickPattern } from "@/lib/fingerpickTypes";
import type { TechniqueCategory } from "@/lib/techniqueRegistry";

import { TECHNIQUE_DEMOS, type TechniqueDemo } from "./demos";

// ── Layout ───────────────────────────────────────────────────────────────────
// Four techniques a row: each demo is one bar, four bars share a stave row,
// and the headers above sit over their bars at the widths the row was laid
// out with.
const DEMOS_PER_ROW = 4;
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

interface GalleryRow {
	category: TechniqueCategory;
	/** First row of its category carries the heading. */
	first: boolean;
	demos: TechniqueDemo[];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

const ROWS: GalleryRow[] = CATEGORY_ORDER.flatMap((category) =>
	chunk(
		TECHNIQUE_DEMOS.filter((d) => d.def.category === category),
		DEMOS_PER_ROW,
	).map((demos, i) => ({ category, first: i === 0, demos })),
);

/** The row's bars as one pattern, so spans and lead-ins are read across it. */
function rowPattern(row: GalleryRow): FingerpickPattern {
	return {
		id: `gallery-row-${row.demos.map((d) => d.def.kind).join("-")}`,
		name: "gallery row",
		bpm: 72,
		timeSignature: [4, 4],
		schemaVersion: FINGERPICK_SCHEMA_VERSION,
		measures: row.demos.map((d) => d.pattern.measures[0]),
		spans: row.demos.flatMap((d) => d.pattern.spans ?? []),
	};
}

function RowBlock({
	row,
	lang,
	width,
	activeKind,
	canPlay,
	onPlay,
	onStop,
}: {
	row: GalleryRow;
	lang: Lang;
	width: number;
	activeKind: string | null;
	canPlay: boolean;
	onPlay: (demo: TechniqueDemo) => void;
	onStop: () => void;
}) {
	const pattern = useMemo(() => rowPattern(row), [row]);
	const renderContext = useMemo(() => ({ index: indexPattern(pattern) }), [pattern]);
	// Each bar no narrower than its own minimum, the row stretched to the width.
	const widths = useMemo(() => {
		if (width === 0) return [];
		const mins = pattern.measures.map((measure, i) => {
			const rd = fingerpickToVexFlow(measure, renderContext);
			return computeMeasureMinWidth(rd.notes, i === 0, hoPoConnectorCount(measure), 0, 0, 0, rd.rolls.length, [], rd.expression);
		});
		const total = mins.reduce((a, b) => a + b, 0);
		const scale = Math.max(1, (width - CLEF_WIDTH - ROW_TRAILING_PAD) / total);
		return mins.map((m) => m * scale);
	}, [pattern, renderContext, width]);

	return (
		<section className="mb-8">
			{row.first && (
				<h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
					{bi(lang, CATEGORY_LABEL[row.category].en, CATEGORY_LABEL[row.category].zh)}
				</h2>
			)}
			<div className="border border-line bg-panel">
				{widths.length > 0 && (
					<>
						<div className="flex" style={{ paddingLeft: CLEF_WIDTH }}>
							{row.demos.map((demo, i) => {
								const { def } = demo;
								const playing = activeKind === def.kind;
								return (
									<div key={def.kind} className="min-w-0 border-r border-line px-2 pt-2 last:border-r-0" style={{ width: widths[i] }}>
										<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
											<span className="font-mono text-[12px] font-semibold text-denim-accent">{def.kind}</span>
											<span className="font-sans text-[12px] text-ink">{bi(lang, def.label.en, def.label.zh)}</span>
											<span className="font-mono text-[11px] text-ink-dim">{def.glyph}</span>
											{def.key && <span className="font-mono text-[10px] text-ink-faint">key {def.key}</span>}
										</div>
										<div className="mt-1 flex items-center gap-2 font-mono text-[10px]">
											<span className={def.render ? "text-denim" : "text-ink-faint"}>{def.render ? "✓" : "–"} render</span>
											<span className={def.audio ? "text-denim" : "text-ink-faint"}>{def.audio ? "✓" : "–"} audio</span>
											<button
												type="button"
												onClick={playing ? onStop : () => onPlay(demo)}
												disabled={!canPlay}
												aria-label={playing ? `Stop ${def.kind}` : `Play ${def.kind}`}
												className={`ml-auto h-6 border px-2 font-mono text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
													playing ? "border-denim bg-denim text-on-denim" : "border-line-strong text-ink-dim hover:bg-denim-tint hover:text-denim"
												}`}
											>
												{playing ? "■" : "▶"}
											</button>
										</div>
									</div>
								);
							})}
						</div>
						<div className="overflow-hidden">
							<TabStaveRow measures={pattern.measures} timeSignature={pattern.timeSignature} measureWidths={widths} renderContext={renderContext} />
						</div>
						<div className="flex" style={{ paddingLeft: CLEF_WIDTH }}>
							{row.demos.map((demo, i) => (
								<p key={demo.def.kind} className="min-w-0 border-r border-line px-2 pb-2 font-sans text-[11px] leading-snug text-ink-dim last:border-r-0" style={{ width: widths[i] }}>
									{bi(lang, demo.note.en, demo.note.zh)}
									{demo.def.ascii && (
										<span className="mt-0.5 block font-mono text-[10px] text-ink-faint">
											ascii{" "}
											{Object.entries(demo.def.ascii)
												.map(([where, mark]) => `${where}: ${mark}`)
												.join(" · ")}
										</span>
									)}
								</p>
							))}
						</div>
					</>
				)}
			</div>
		</section>
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
						"One bar per kind, four to a row, built from techniqueRegistry.ts: the stave is what the converter draws, ▶ plays that bar through the scheduler. The render / audio marks are the registry's flags, which the test suite ties to the converter's and scheduler's handler tables.",
						"每种技巧一小节，一行四个，由 techniqueRegistry.ts 生成：谱面是转换器画出的样子，▶ 用调度器播放那一小节。render / audio 标记来自注册表，测试会把它们与转换器、调度器的处理表对上。",
					)}
				</p>
			</header>

			<div ref={containerRef}>
				{ROWS.map((row) => (
					<RowBlock
						key={row.demos.map((d) => d.def.kind).join("-")}
						row={row}
						lang={lang}
						width={width}
						// A play-once pass ends on its own: the button follows the engine, not the click.
						activeKind={isPlaying ? activeKind : null}
						canPlay={isLoaded}
						onPlay={play}
						onStop={stop}
					/>
				))}
			</div>
		</div>
	);
}
