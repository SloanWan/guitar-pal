import { execSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { EvalCase, EvalMetric, EvalRun, EvalSubject, RunStatus } from "@/lib/evals/types";

/**
 * A run file a TypeScript eval writes as it goes (#370) — the same shape the
 * Python runners write (`book-service/evals/runlog.py`). Every `add` rewrites
 * the file through a temp file and a rename, so `/dev/evals` can follow the
 * run without ever reading half a file.
 */
export class RunLog {
	readonly run: EvalRun;
	private readonly file: string;
	private readonly summarise: (cases: readonly EvalCase[]) => Record<string, number>;

	constructor(
		dir: string,
		init: {
			suite: string;
			title: string;
			metrics: EvalMetric[];
			subject: Pick<EvalSubject, "id" | "label" | "group" | "notes">;
			total: number;
			config?: Record<string, unknown>;
			issue?: number;
		},
		summarise: (cases: readonly EvalCase[]) => Record<string, number>,
	) {
		const started = new Date();
		const runId = started.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
		this.file = path.join(dir, `${runId}-${init.subject.id}.json`);
		this.summarise = summarise;
		this.run = {
			suite: init.suite,
			title: init.title,
			issue: init.issue,
			run_id: `${runId}-${init.subject.id}`,
			status: "running",
			started_at: started.toISOString(),
			finished_at: null,
			git_sha: gitSha(),
			machine: `${os.cpus()[0]?.model ?? os.arch()}, ${os.cpus().length} cores, ${os.platform()}`,
			config: init.config,
			progress: { done: 0, total: init.total },
			metrics: init.metrics,
			subjects: [{ ...init.subject, status: "running", summary: {} }],
			cases: [],
		};
		mkdirSync(dir, { recursive: true });
		this.write();
	}

	add(c: EvalCase): void {
		this.run.cases.push(c);
		if (this.run.progress) this.run.progress.done += 1;
		this.run.subjects[0].summary = this.summarise(this.run.cases);
		this.write();
	}

	/** Ends the run; a run that stopped short of its total is `failed`. */
	finish(status?: RunStatus): void {
		if (this.run.status !== "running") return;
		const complete = !this.run.progress || this.run.progress.done >= this.run.progress.total;
		this.run.status = status ?? (complete ? "done" : "failed");
		this.run.finished_at = new Date().toISOString();
		this.run.subjects[0].status = this.run.status === "done" ? "done" : "failed";
		this.write();
	}

	private write(): void {
		const tmp = `${this.file}.tmp`;
		writeFileSync(tmp, `${JSON.stringify(this.run, null, "\t")}\n`);
		renameSync(tmp, this.file);
	}
}

function gitSha(): string | null {
	try {
		return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
	} catch {
		return null;
	}
}
