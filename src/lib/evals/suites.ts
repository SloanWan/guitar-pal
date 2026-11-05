import type { EvalMetric } from "@/lib/evals/types";

/**
 * The suites `/dev/evals` knows, where their runs are written, and the two
 * metrics each one's scatter puts against each other (quality up, cost or
 * time along). Paths are relative to the repo root.
 */
export interface EvalSuite {
	id: string;
	title: string;
	description: string;
	/** Folders of run files in the shared shape. */
	runDirs: string[];
	/** A pre-#370 baseline file, read through an adapter. */
	legacy?: { path: string; kind: "assistant" | "chapter-qa" };
	/** The headline metric: the table sorts nothing by it, the cards lead with it. */
	primary: string;
	/** Absent where subjects are not alike enough to plot (Q&A rows are provider × fixture). */
	scatter?: { x: string; y: string };
	/** The metric a case cell shows when the suite grades by numbers, not pass/fail. */
	cellMetric?: string;
}

export const ASSISTANT_METRICS: EvalMetric[] = [
	{ key: "pass_rate", label: "Pass rate", direction: "higher", format: "percent", description: "Runs that passed, over every case × repeat." },
	{ key: "never", label: "Never", direction: "lower", format: "fixed0", description: "Cases that failed every repeat." },
	{ key: "flaky", label: "Flaky", direction: "lower", format: "fixed0", description: "Cases that passed some repeats, not all." },
	{ key: "cost_per_turn_usd", label: "$ / turn", direction: "lower", format: "usd" },
	{ key: "calls_per_turn", label: "Calls / turn", direction: "lower", format: "fixed2", description: "Model calls a turn took, tool loops included." },
	{ key: "latency_p50_ms", label: "p50", direction: "lower", format: "ms" },
	{ key: "latency_p95_ms", label: "p95", direction: "lower", format: "ms" },
];

export const CHAPTER_QA_METRICS: EvalMetric[] = [
	{ key: "routing", label: "Routing", direction: "higher", format: "percent", description: "Factual → book, general/decline → general." },
	{ key: "page_recall", label: "Page recall", direction: "higher", format: "percent", description: "A gold page among the cited pages." },
	{ key: "faithfulness", label: "Faithful", direction: "higher", format: "percent", description: "The judge finds every claim in the cited pages." },
	{ key: "draft", label: "Draft", direction: "higher", format: "percent" },
	{ key: "injection", label: "Injection held", direction: "higher", format: "percent", description: "The answer never says the injected marker. Anything under 100% is a leak." },
	{ key: "cold_usd", label: "$ cold", direction: "lower", format: "usd" },
	{ key: "warm_usd", label: "$ warm", direction: "lower", format: "usd" },
	{ key: "usd_total", label: "$ total", direction: "lower", format: "usd" },
	{ key: "latency_p50_s", label: "p50", direction: "lower", format: "s" },
];

export const SUITES: EvalSuite[] = [
	{
		id: "assistant",
		title: "Assistant",
		description: "The General assistant over the strum and tab case sets: did the right reader or composer run, and did the card come out right.",
		runDirs: ["src/lib/assistant/__evals__/runs"],
		legacy: { path: "src/lib/assistant/__evals__/baseline.json", kind: "assistant" },
		primary: "pass_rate",
		scatter: { x: "cost_per_turn_usd", y: "pass_rate" },
	},
	{
		id: "chapter-qa",
		title: "Chapter Q&A",
		description: "Questions on exported chapters (long_context): routing, page recall, faithfulness by a judge, drafts and an injected instruction.",
		runDirs: ["book-service/evals/ask/results"],
		legacy: { path: "book-service/evals/ask/baseline-sample.json", kind: "chapter-qa" },
		primary: "page_recall",
	},
	{
		id: "ocr",
		title: "OCR",
		description:
			"OCR on the 26 scanned sample pages, scored against a per-page reference transcription: engines side by side (#369), then PP-OCR with a layout mask, a vision re-read or a text correction on top (#375).",
		runDirs: ["book-service/evals/ocr/results"],
		// Not CER: the reference leaves notation out and engines read it in any
		// order, so CER mostly measures the tab digits and the column order.
		primary: "char_f1",
		scatter: { x: "seconds_per_page", y: "char_recall" },
		cellMetric: "char_recall",
	},
	{
		id: "notation-pages",
		title: "Notation pages",
		description:
			"Which pages the chapter parse could skip classifying: a layout model and the tag rules against the parse's own classifier (Sonnet 5), page by page, on Chinese and English scans and one text-layer book (#375).",
		runDirs: ["book-service/evals/notation/results"],
		primary: "skip_rate",
		scatter: { x: "recall", y: "skip_rate" },
	},
	{
		id: "tab-extraction",
		title: "Tab extraction",
		description:
			"Tab exercises read off book crops against the gold set reviewed on /dev/tab-gold: notes matched by onset, rhythm, chords, and how well the jianpu cross-check flags the wrong notes.",
		runDirs: ["book-service/evals/tab/results"],
		primary: "note_f1",
		cellMetric: "note_f1",
	},
	{
		id: "page-classification",
		title: "Page classification",
		description:
			"The parse's page classifier against the pages reviewed on /dev/page-gold: whether the pages with tab are sent to the tab reader, how many of their exercises that keeps, and the kinds and printed notation (#422).",
		runDirs: ["book-service/evals/classify/results"],
		primary: "tab_exercise_recall",
	},
];
