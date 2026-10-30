"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, PanelRightOpen, TriangleAlert } from "lucide-react";
import { cropUrl } from "@/lib/books/api";
import type { ChapterExercise } from "@/lib/books/types";

export const KIND_LABEL: Record<ChapterExercise["kind"], string> = {
	strum: "Strum",
	progression: "Progression",
	tab: "Tab",
	chord_diagram: "Chord",
};

/** A draft's name, or "Untitled" for one the reader left nameless. */
export function draftName(exercise: ChapterExercise): string {
	const name = exercise.draft.name;
	return typeof name === "string" && name ? name : "Untitled";
}

/** The facts after the page: kind, provenance, length, tempo. */
export function draftFacts(exercise: ChapterExercise): string {
	const { draft } = exercise;
	const measures = Array.isArray(draft.measures) ? draft.measures.length : null;
	const bpm = typeof draft.bpm === "number" ? draft.bpm : null;
	return [
		KIND_LABEL[exercise.kind],
		exercise.source,
		measures !== null ? `${measures} ${measures === 1 ? "bar" : "bars"}` : null,
		bpm !== null ? `♩=${bpm}` : null,
	]
		.filter((part) => part !== null)
		.join(" · ");
}

/**
 * One practice draft in the chapter card (#404): the crop the reader saw, the
 * name and what it is, its warnings counted, Used once it was kept or sent
 * on. The whole row opens it beside the book; the page key over it opens the
 * page instead. Only tab drafts open — the strum reader has not landed.
 */
export default function DraftRow({
	exercise,
	selected,
	onOpen,
	onLocate,
}: {
	exercise: ChapterExercise;
	/** The draft open in the panel. */
	selected: boolean;
	onOpen: () => void;
	onLocate: () => void;
}) {
	const name = draftName(exercise);
	const opens = exercise.kind === "tab";
	const warnings = exercise.warnings.length;
	return (
		<li className="bk-dr" data-opens={opens ? "" : undefined} aria-current={selected ? "true" : undefined}>
			{exercise.crop_path ? <CropThumb path={exercise.crop_path} alt={`Page ${exercise.page}, ${name}`} /> : null}
			<span className="bk-dr-x">
				<b>
					<span className="gp-title">{name}</span>
				</b>
				<span className="bk-meta">
					<button type="button" onClick={onLocate} title="See this page of the book" className="bk-lnk bk-over">
						p.{exercise.page}
						<ArrowUpRight aria-hidden />
					</button>{" "}
					· {draftFacts(exercise)}
				</span>
				{opens ? null : <span className="bk-meta">Opens in the strum editor once that reader lands</span>}
			</span>
			<span className="bk-dr-r">
				{warnings > 0 ? (
					<span
						className="bk-st"
						data-tone="warn"
						title={exercise.warnings.map((w) => w.message).join("\n")}
						aria-label={`${warnings} ${warnings === 1 ? "warning" : "warnings"}`}
					>
						<TriangleAlert aria-hidden />
						{warnings}
					</span>
				) : null}
				{exercise.status === "taken" ? (
					<span className="bk-st" data-tone="ok">
						<Check aria-hidden />
						Used
					</span>
				) : null}
				{opens ? (
					// Stretched over the row (books.css), under the page key.
					<button type="button" onClick={onOpen} className="bk-ops" aria-label={`Open ${name}`}>
						<PanelRightOpen aria-hidden />
						<span>Open</span>
					</button>
				) : null}
			</span>
		</li>
	);
}

/** The crop the reader saw, from the private bucket by a short-lived URL. */
function CropThumb({ path, alt }: { path: string; alt: string }) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		void cropUrl(path).then((next) => {
			if (!cancelled) setUrl(next);
		});
		return () => {
			cancelled = true;
		};
	}, [path]);
	return (
		<span className="bk-crop">
			{/* A signed, hour-long Storage URL: not a candidate for next/image's loader. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			{url ? <img src={url} alt={alt} loading="lazy" /> : null}
		</span>
	);
}
