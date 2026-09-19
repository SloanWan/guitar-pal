"use client";

import { useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ChordProgression } from "@/lib/strumPatterns";
import { progressionCapo, progressionDisplayName } from "@/lib/strumProgressions";

interface Props {
	open: boolean;
	onClose: () => void;
	patternName: string;
	/** This pattern's progressions, in list order. */
	progressions: ChordProgression[];
	/** The one on screen — checked to begin with. */
	openId: string | null;
	/**
	 * Copy the link. Called from the button's own click so the clipboard write
	 * inside it still counts as a user gesture; an empty list shares the bare
	 * rhythm.
	 */
	onShare: (selected: ChordProgression[]) => void;
}

/**
 * Asked only when the pattern has more than one progression: which of them
 * go with the rhythm. A pattern with one, or none, is shared without a
 * question.
 */
export default function ShareStrumDialog({
	open,
	onClose,
	patternName,
	progressions,
	openId,
	onShare,
}: Props) {
	// Keyed on `open` by the parent so a fresh mount starts from the open one.
	const [checked, setChecked] = useState<Set<string>>(
		() => new Set(openId ? [openId] : []),
	);
	const count = checked.size;

	function toggle(id: string) {
		setChecked((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				showCloseButton={false}
				className="w-[calc(100%-2rem)] max-w-100 flex flex-col gap-0 overflow-hidden p-0 rounded-none border border-line-strong shadow-none"
			>
				<DialogHeader className="shrink-0 p-4 pb-3">
					<DialogTitle>Share {patternName}</DialogTitle>
					<p className="text-xs text-ink-dim">
						The rhythm always goes. Tick the progressions to send with it — none, and the
						link opens on the bare pattern.
					</p>
				</DialogHeader>

				<div className="flex items-center justify-between border-y border-line px-4 py-2">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
						Progressions
					</span>
					<div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em]">
						<button
							type="button"
							onClick={() => setChecked(new Set(progressions.map((p) => p.id)))}
							className="px-1.5 py-0.5 text-denim transition-colors hover:bg-denim-tint"
						>
							All
						</button>
						<button
							type="button"
							onClick={() => setChecked(new Set())}
							className="px-1.5 py-0.5 text-ink-dim transition-colors hover:bg-raise hover:text-ink"
						>
							None
						</button>
					</div>
				</div>

				<ul className="flex max-h-[50vh] flex-col overflow-y-auto">
					{progressions.map((progression) => {
						const on = checked.has(progression.id);
						const capo = progressionCapo(progression);
						return (
							<li key={progression.id}>
								<label
									className={`flex cursor-pointer items-center gap-3 border-b border-line px-4 py-2.5 transition-colors ${
										on ? "bg-denim-tint" : "hover:bg-raise"
									}`}
								>
									<input
										type="checkbox"
										checked={on}
										onChange={() => toggle(progression.id)}
										className="sr-only"
									/>
									<span
										aria-hidden
										className={`flex h-4 w-4 shrink-0 items-center justify-center border transition-colors ${
											on ? "border-denim bg-denim text-on-denim" : "border-line-strong bg-transparent"
										}`}
									>
										{on && <Check size={12} strokeWidth={3} />}
									</span>
									<span className="min-w-0 flex-1 truncate text-sm text-ink">
										{progressionDisplayName(progression)}
									</span>
									<span className="shrink-0 font-mono text-[10px] text-ink-faint">
										{progression.bars.length} bars{capo > 0 ? ` · capo ${capo}` : ""}
									</span>
								</label>
							</li>
						);
					})}
				</ul>

				<div className="flex items-center justify-end gap-2 shrink-0 bg-popover px-4 py-3">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 border border-line-strong text-ink-dim text-sm hover:border-denim hover:text-denim-accent active:bg-denim-tint transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => onShare(progressions.filter((p) => checked.has(p.id)))}
						className="flex h-9 items-center gap-2 px-4 bg-denim text-sm font-medium text-on-denim hover:bg-denim-accent active:bg-denim-accent transition-colors"
					>
						<LinkIcon size={14} />
						{count === 0
							? "Copy link — rhythm only"
							: `Copy link — ${count} progression${count === 1 ? "" : "s"}`}
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
