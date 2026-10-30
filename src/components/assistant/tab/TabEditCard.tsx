"use client";

import { useMemo, useState } from "react";
import { Check, Music, Pencil, Plus, Replace, Settings2, Trash2, TriangleAlert, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import TabStavePreview from "./TabStavePreview";
import { useTabAudition } from "./useTabAudition";
import HearButton from "../HearButton";
import { Button } from "@/components/ui/button";
import { Option, Options } from "../Options";
import { stashHandoff } from "@/lib/assistant/handoff";
import { pick, type Lang } from "@/lib/assistant/lang";
import type { TabTurnOutcome } from "@/lib/assistant/tab/turn";
import { moveSlotChord } from "@/lib/fingerpickChords";
import type { Measure } from "@/lib/fingerpickTypes";
import { indexPattern } from "@/lib/fingerpickIndex";

/**
 * Bars for a pattern the player already has, before anything is written.
 *
 * The message has said what will happen; this shows the bars as they will
 * look and asks, and can play them ("Hear it", the bars alone). A chord mark can be dragged to another slot first — the
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
	// The pattern's settings over the bars alone: what "Hear it" plays.
	const heard = useMemo(() => ({ ...edit.pattern, measures }), [edit.pattern, measures]);
	// Where the bars' spans lie, for the preview's brackets; the bars keep the pattern's slot ids.
	const renderContext = useMemo(() => ({ index: indexPattern(heard) }), [heard]);
	const audition = useTabAudition(heard);
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
			<p className="as-done">
				<Check aria-hidden="true" />
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
				<Pencil aria-hidden="true" />
			) : edit.kind === "delete" ? (
				<Trash2 aria-hidden="true" />
			) : (
				<Settings2 aria-hidden="true" />
			);
		return (
			<Options>
				<Option order={0} tone="ghost" onClick={() => setDismissed(true)} icon={<X aria-hidden="true" />}>
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
		<div className="as-card" data-m="tab">
			<div className="as-card-h">
				<span className="as-card-t">
					{edit.kind === "append" ? t("Add to", "加到") : edit.kind === "replace" ? t("Replace in", "替换") : t("Chords on", "标和弦")}{" "}
					{edit.pattern.name}
				</span>
				<span className="as-card-meta">
					{edit.kind === "append"
						? t(`bar ${firstBar} on`, `第 ${firstBar} 小节起`)
						: lastBar > firstBar
							? t(`bars ${firstBar}–${lastBar}`, `第 ${firstBar}–${lastBar} 小节`)
							: t(`bar ${firstBar}`, `第 ${firstBar} 小节`)}
				</span>
			</div>

			<div className="as-card-b">
				<div className="as-stave">
					<TabStavePreview
						measures={measures}
						timeSignature={edit.pattern.timeSignature}
						renderContext={renderContext}
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
				</div>
				{/* Reserved, so moving a chord does not push the footer down. */}
				<span className="as-card-note">
					{moved
						? t("Moved — the bars go in as they are now.", "已移动——按现在的位置写入。")
						: more > 0
							? t(`${more} more in the editor`, `还有 ${more} 小节在编辑器里`)
							: edit.kind === "chords"
								? t("Drag a chord to another slot to move it.", "拖动和弦可以换到别的格。")
								: " "}
				</span>
				{edit.warnings.length > 0 && (
					<ul className="as-warn">
						{edit.warnings.map((warning) => (
							<li key={`${warning.code}:${warning.path}:${warning.message}`}>
								<TriangleAlert aria-hidden="true" />
								<span>{warning.message}</span>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="as-card-f">
				<Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
					<X aria-hidden="true" />
					{t("Leave it", "算了")}
				</Button>
				<HearButton playing={audition.isPlaying} preparing={audition.isPreparing} onClick={audition.toggle} lang={lang} />
				<Button size="sm" onClick={confirm}>
					{edit.kind === "append" ? (
						<Plus aria-hidden="true" />
					) : edit.kind === "replace" ? (
						<Replace aria-hidden="true" />
					) : (
						<Music aria-hidden="true" />
					)}
					{edit.kind === "append"
						? t("Add the bars", "加上")
						: edit.kind === "replace"
							? t("Replace the bar", "替换")
							: t("Mark the chords", "标上")}
				</Button>
			</div>
		</div>
	);
}
