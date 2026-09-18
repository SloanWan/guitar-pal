"use client";

import { useState } from "react";
import { Check, Music, Plus, Replace, TriangleAlert, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import TabStavePreview from "./TabStavePreview";
import { Option, Options } from "./Options";
import { stashHandoff } from "@/lib/strumAssistant/handoff";
import { pick, type Lang } from "@/lib/strumAssistant/lang";
import type { TabTurnOutcome } from "@/lib/tabAssistant/turn";

/**
 * Bars for a pattern the player already has, before anything is written.
 *
 * The message has said what will happen; this shows the bars as they will
 * look and asks. Confirming hands them to the fingerpick page, which owns
 * the save — a preset is copied there, never changed.
 */

const FINGERPICK_PATH = "/fingerpick";

export default function TabEditCard({
	edit,
	done,
	onDone,
	lang = "en",
}: {
	edit: NonNullable<TabTurnOutcome["edit"]>;
	/** Confirmed already — kept on the message, so it survives the panel closing. */
	done: boolean;
	onDone: () => void;
	lang?: Lang;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const t = (en: string, zh: string) => pick(lang, en, zh);
	const [dismissed, setDismissed] = useState(false);
	const [shown, setShown] = useState(0);
	const more = edit.measures.length - shown;

	function confirm() {
		// Chord marks are a rewrite of the bars they sit on — the page swaps the
		// run in, the way it swaps one bar for a replace.
		stashHandoff({
			kind: "fingerpick-edit",
			op: edit.kind === "append" ? "append" : "replace",
			patternId: edit.pattern.id,
			patternName: edit.pattern.name,
			barIndex: edit.kind === "append" ? null : edit.barIndex,
			replaceCount: edit.kind === "append" ? 0 : edit.measures.length,
			measures: edit.measures,
		});
		onDone();
		if (pathname !== FINGERPICK_PATH) router.push(FINGERPICK_PATH);
	}

	if (done) {
		return (
			<p className="flex items-center gap-1.5 pl-2 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent">
				<Check className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
				{edit.kind === "append"
					? t("Bars added", "小节已加上")
					: edit.kind === "replace"
						? t("Bar replaced", "小节已替换")
						: t("Chords marked", "和弦已标上")}
			</p>
		);
	}
	if (dismissed) return null;

	const firstBar = edit.kind === "append" ? edit.pattern.measures.length + 1 : edit.barIndex + 1;
	const lastBar = firstBar + edit.measures.length - 1;

	return (
		<div className="mt-2 border border-denim bg-surface animate-[proposal-pop_0.18s_ease-out] motion-reduce:animate-none">
			<div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
				<span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
					{edit.kind === "append" ? t("Add to", "加到") : edit.kind === "replace" ? t("Replace in", "替换") : t("Chords on", "标和弦")}{" "}
					{edit.pattern.name}
				</span>
				<span className="shrink-0 font-mono text-[11px] tracking-[0.04em] text-ink-faint">
					{edit.kind === "append"
						? t(`bar ${firstBar} on`, `第 ${firstBar} 小节起`)
						: lastBar > firstBar
							? t(`bars ${firstBar}–${lastBar}`, `第 ${firstBar}–${lastBar} 小节`)
							: t(`bar ${firstBar}`, `第 ${firstBar} 小节`)}
				</span>
			</div>

			<TabStavePreview
				measures={edit.measures}
				timeSignature={edit.pattern.timeSignature}
				startMeasureNumber={firstBar}
				onShown={setShown}
			/>

			{more > 0 && (
				<div className="border-t border-line px-3 py-2 font-mono text-xs tracking-[0.04em] text-ink-dim">
					{t(`${more} more in the editor`, `还有 ${more} 小节在编辑器里`)}
				</div>
			)}

			{edit.warnings.length > 0 && (
				<ul className="border-t border-line px-3 py-2">
					{edit.warnings.map((warning) => (
						<li key={`${warning.code}:${warning.path}:${warning.message}`} className="flex gap-2 py-0.5 text-xs leading-snug text-ink-dim">
							<TriangleAlert className="mt-px size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
							<span>{warning.message}</span>
						</li>
					))}
				</ul>
			)}

			<div className="border-t border-line p-2">
				<Options>
					<Option order={0} tone="ghost" onClick={() => setDismissed(true)} icon={<X className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
						{t("Leave it", "算了")}
					</Option>
					<Option
						order={1}
						tone="outline"
						onClick={confirm}
						icon={
							edit.kind === "append" ? (
								<Plus className="size-3" strokeWidth={1.5} aria-hidden="true" />
							) : edit.kind === "replace" ? (
								<Replace className="size-3" strokeWidth={1.5} aria-hidden="true" />
							) : (
								<Music className="size-3" strokeWidth={1.5} aria-hidden="true" />
							)
						}
					>
						{edit.kind === "append"
							? t("Add the bars", "加上")
							: edit.kind === "replace"
								? t("Replace the bar", "替换")
								: t("Mark the chords", "标上")}
					</Option>
				</Options>
			</div>
		</div>
	);
}
