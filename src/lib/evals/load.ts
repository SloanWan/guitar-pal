import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { assistantBaselineRuns, chapterQaBaselineRun, type AssistantBaseline, type ChapterQaBaseline } from "@/lib/evals/legacy";
import { SUITES, type EvalSuite } from "@/lib/evals/suites";
import type { EvalRun, EvalRunHeader, EvalSuiteListing } from "@/lib/evals/types";

/**
 * Reads eval runs off disk for `/api/dev/evals` — dev only, from a checkout:
 * the run files are written by local runners and never deployed.
 */

interface LoadedRun {
	run: EvalRun;
	updatedAt: string;
	legacy: boolean;
}

function isEvalRun(value: unknown): value is EvalRun {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.suite === "string" &&
		typeof v.run_id === "string" &&
		typeof v.status === "string" &&
		Array.isArray(v.metrics) &&
		Array.isArray(v.subjects) &&
		Array.isArray(v.cases)
	);
}

async function readJson(file: string): Promise<{ value: unknown; mtime: Date } | null> {
	try {
		const [text, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
		return { value: JSON.parse(text) as unknown, mtime: info.mtime };
	} catch {
		// Missing, or caught mid-write by a runner that does not rename into place.
		return null;
	}
}

async function suiteRuns(root: string, suite: EvalSuite): Promise<LoadedRun[]> {
	const out: LoadedRun[] = [];
	for (const dir of suite.runDirs) {
		let names: string[];
		try {
			names = await readdir(path.join(root, dir));
		} catch {
			continue;
		}
		const files = names.filter((n) => n.endsWith(".json"));
		const read = await Promise.all(files.map((n) => readJson(path.join(root, dir, n))));
		for (const r of read) {
			if (r && isEvalRun(r.value) && r.value.suite === suite.id)
				out.push({ run: r.value, updatedAt: r.mtime.toISOString(), legacy: false });
		}
	}
	if (suite.legacy) {
		const r = await readJson(path.join(root, suite.legacy.path));
		if (r) {
			const updatedAt = r.mtime.toISOString();
			const runs =
				suite.legacy.kind === "assistant"
					? assistantBaselineRuns(r.value as AssistantBaseline)
					: [chapterQaBaselineRun(r.value as ChapterQaBaseline, updatedAt)];
			for (const run of runs) out.push({ run, updatedAt, legacy: true });
		}
	}
	return out;
}

function header({ run, updatedAt, legacy }: LoadedRun): EvalRunHeader {
	const { cases, ...rest } = run;
	return { ...rest, updated_at: updatedAt, legacy: legacy || undefined, case_count: cases.length };
}

const newestFirst = (a: EvalRunHeader, b: EvalRunHeader) =>
	(Date.parse(b.started_at ?? b.updated_at) || 0) - (Date.parse(a.started_at ?? a.updated_at) || 0);

/** Every suite with its runs' headers, newest run first. */
export async function listSuites(root: string): Promise<EvalSuiteListing[]> {
	return Promise.all(
		SUITES.map(async (suite) => ({
			id: suite.id,
			title: suite.title,
			description: suite.description,
			runs: (await suiteRuns(root, suite)).map(header).sort(newestFirst),
		})),
	);
}

/** One run with its cases, or null. */
export async function readRun(root: string, suiteId: string, runId: string): Promise<EvalRun | null> {
	const suite = SUITES.find((s) => s.id === suiteId);
	if (!suite) return null;
	const runs = await suiteRuns(root, suite);
	return runs.find((r) => r.run.run_id === runId)?.run ?? null;
}
