/**
 * One shape for every eval run (#370): the assistant eval, the chapter Q&A
 * eval and the OCR comparison all write it (the Python runners as JSON with
 * the same keys), and `/dev/evals` reads nothing else. A runner rewrites its
 * file after every case, so a run in progress is just a run whose `status`
 * is still `running`.
 *
 * Keys are snake_case because half the writers are Python.
 */

export type MetricDirection = "higher" | "lower";

/** How a value is printed; the unit lives in the format. */
export type MetricFormat = "percent" | "usd" | "fixed0" | "fixed1" | "fixed2" | "ms" | "s";

/**
 * A metric, defined once per run: the table's arrows, "best" marks, delta
 * colours and the scatter's axis direction all read `direction` from here.
 */
export interface EvalMetric {
	key: string;
	label: string;
	direction: MetricDirection;
	format: MetricFormat;
	description?: string;
}

export type RunStatus = "running" | "done" | "failed";
export type SubjectStatus = "queued" | "loading" | "running" | "done" | "failed";

/** What a run compares: a model, a provider on a fixture, an OCR engine. */
export interface EvalSubject {
	id: string;
	label: string;
	/** Rows with the same group sit together in the table. */
	group?: string;
	notes?: string;
	status?: SubjectStatus;
	error?: string;
	/** Metric key → value, over the cases finished so far. */
	summary: Record<string, number>;
	/** The same, per group of cases (a book, a fixture), for the by-group chart. */
	breakdown?: Record<string, Record<string, number>>;
}

/** One graded attempt: a question, a page, an assistant turn. */
export interface EvalCase {
	subject: string;
	case: string;
	/** 1-based, when the suite runs each case more than once. */
	repeat?: number;
	/** Pass/fail suites set this; metric-only suites (OCR) leave it out. */
	pass?: boolean;
	/** The attempt could not be graded (a crash, a judge that did not answer). */
	error?: string;
	metrics: Record<string, number>;
	failures?: string[];
	/** Suite-specific context for the case drawer. Never book text. */
	detail?: Record<string, unknown>;
}

export interface EvalRun {
	suite: string;
	title: string;
	run_id: string;
	status: RunStatus;
	started_at: string | null;
	finished_at: string | null;
	git_sha?: string | null;
	machine?: string;
	issue?: number;
	config?: Record<string, unknown>;
	progress?: { done: number; total: number };
	/**
	 * What the run showed, written after it (the read-out in calibration.md,
	 * a sentence each). Shown with the suite; never book text.
	 */
	findings?: string[];
	/** The same read-out in Chinese; shown in place of `findings` when present. */
	findings_zh?: string[];
	metrics: EvalMetric[];
	subjects: EvalSubject[];
	cases: EvalCase[];
}

/** A run without its cases: what the page polls. */
export type EvalRunHeader = Omit<EvalRun, "cases"> & {
	/** When the file last changed, so the page knows to refetch the cases. */
	updated_at: string;
	/** True for a run read from a pre-#370 baseline file. */
	legacy?: boolean;
	case_count: number;
};

export interface EvalSuiteListing {
	id: string;
	title: string;
	description: string;
	runs: EvalRunHeader[];
}
