"use client";

import { useState } from "react";
import { Check, Music, Pencil, Plus, Replace, Settings2, Trash2, TriangleAlert, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import TabStavePreview from "./TabStavePreview";
import { Option, Options } from "../Options";
import { stashHandoff } from "@/lib/assistant/handoff";
import { pick, type Lang } from "@/lib/assistant/lang";
import type { TabTurnOutcome } from "@/lib/assistant/tab/turn";
import { moveSlotChord } from "@/lib/fingerpickChords";
import type { Measure } from "@/lib/fingerpickTypes";

/**
 * Bars for a pattern the player already has, before anything is written.
 *
 * The message has said what will happen; this shows the bars as they will
 * look and asks. A chord mark can be dragged to another slot first — the
 * reader places marks by beat, and the slot meant is the player's to say.
 * Confirming hands the bars to the fingerpick page, which owns the save — a
 * preset is copied there, never changed.
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
	const bars = edit.kind === "append" || edit.kind === "replace" || edit.kind === "chords";
	// The bars as the player has arranged them: the reader's, until a chord
	// mark is dragged elsewhere. What confirming hands over.
	const [measures, setMeasures] = useState<Measure[]>(bars ? edit.measures : []);
	const [moved, setMoved] = useState(false);
	const more = bars ? measures.length - shown : 0;

	function leave() {
		onDone();
		if (pathname !== FINGERPICK_PATH) router.push(FINGERPICK_PATH);
	}

	function confirm() {
		const base = { patternId: edit.pattern.id, patternName: edit.pattern.name };
		if (edit.kind === "rename") stashHandoff({ kind: "fingerpick-rename", ...base, newName: edit.newName });
		else if (edit.kind === "delete") stashHandoff({ kind: "fingerpick-delete", ...base });
		else if (edit.kind === "set") {
			stashHandoff({ kind: "fingerpick-set", ...base, bpm: edit.bpm, timeSignature: edit.timeSignature });
		} else {
			// Chord marks are a rewrite of the bars they sit on — the page swaps
			// the run in, the way it swaps one bar for a replace.
			stashHandoff({
				kind: "fingerpick-edit",
				op: edit.kind === "append" ? "append" : "replace",
				...base,
				barIndex: edit.kind === "append" ? null : edit.barIndex,
				replaceCount: edit.kind === "append" ? 0 : measures.length,
				measures,
			});
		}
		leave();
	}

	if (done) {
		const said: Record<typeof edit.kind, string> = {
			append: t("Bars added", "小节已加上"),
			replace: t("Bar replaced", "小节已替换"),
			chords: t("Chords marked", "和弦已标上"),
			rename: t("Renamed", "已改名"),
			delete: t("Deleted", "已删除"),
			set: t("Changed", "已修改"),
		};
		return (
			<p className="flex items-center gap-1.5 pl-2 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent">
				<Check className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
				{said[edit.kind]}
			</p>
		);
	}
	if (dismissed) return null;

	// The pattern itself, not its bars: a yes or a no under the message that
	// already said what will happen, the way a strum delete is confirmed.
	if (!bars) {
		const icon =
			edit.kind === "rename" ? (
				<Pencil className="size-3" strokeWidth={1.5} aria-hidden="true" />
			) : edit.kind === "delete" ? (
				<Trash2 className="size-3" strokeWidth={1.5} aria-hidden="true" />
			) : (
				<Settings2 className="size-3" strokeWidth={1.5} aria-hidden="true" />
			);
		return (
			<Options>
				<Option order={0} tone="ghost" onClick={() => setDismissed(true)} icon={<X className="size-3" strokeWidth={1.5} aria-hidden="true" />}>
					{edit.kind === "delete" ? t("Keep it", "留着") : t("Leave it", "算了")}
				</Option>
				<Option order={1} tone={edit.kind === "delete" ? "danger" : "outline"} onClick={confirm} icon={icon}>
					{edit.kind === "rename" ? t("Rename", "改名") : edit.kind === "delete" ? t("Delete", "删除") : t("Change it", "改")}
				</Option>
			</Options>
		);
	}

	const firstBar = edit.kind === "append" ? edit.pattern.measures.length + 1 : edit.barIndex + 1;
	const lastBar = firstBar + measures.length - 1;

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
				measures={measures}
				timeSignature={edit.pattern.timeSignature}
				startMeasureNumber={firstBar}
				onShown={setShown}
				onMoveChord={(from, to) => {
					const next = moveSlotChord(measures, from, to);
					if (!next) return;
					setMeasures(next);
					setMoved(true);
				}}
				lang={lang}
			/>
			{moved && (
				<div className="border-t border-line px-3 py-2 font-mono text-xs tracking-[0.04em] text-ink-dim">
					{t("Moved — the bars go in as they are now.", "已移动——按现在的位置写入。")}
				</div>
			)}

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
