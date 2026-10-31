"use client";

import { useState } from "react";
import { Link as LinkIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
			<DialogContent data-m="strum" className="flex max-w-100 flex-col gap-3 sm:max-w-100">
				<DialogHeader>
					<DialogTitle className="text-[17px] font-bold">Share {patternName}</DialogTitle>
					<DialogDescription className="st-lab">
						The rhythm always goes. Tick the progressions to send with it — none, and the link opens on the
						rhythm alone.
					</DialogDescription>
				</DialogHeader>

				<div className="flex items-center justify-between">
					<span className="text-[13px] font-bold">Progressions</span>
					<span className="flex gap-1">
						<Button variant="ghost" size="xs" onClick={() => setChecked(new Set(progressions.map((p) => p.id)))}>
							All
						</Button>
						<Button variant="ghost" size="xs" onClick={() => setChecked(new Set())}>
							None
						</Button>
					</span>
				</div>

				<ul className="-mx-1 flex max-h-[50vh] flex-col gap-1 overflow-y-auto px-1">
					{progressions.map((progression) => {
						const on = checked.has(progression.id);
						const capo = progressionCapo(progression);
						return (
							<li key={progression.id}>
								<label className="st-pitem flex-row items-center gap-3" aria-current={on ? "true" : undefined}>
									<input type="checkbox" checked={on} onChange={() => toggle(progression.id)} className="size-4 accent-[var(--gp-m-500)]" />
									<span className="st-pitem-name min-w-0 flex-1 truncate">{progressionDisplayName(progression)}</span>
									<span className="st-lab shrink-0">
										{progression.bars.length} bars{capo > 0 ? ` · capo ${capo}` : ""}
									</span>
								</label>
							</li>
						);
					})}
				</ul>

				<DialogFooter>
					<Button variant="ghost" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button size="sm" onClick={() => onShare(progressions.filter((p) => checked.has(p.id)))}>
						<LinkIcon aria-hidden />
						{count === 0 ? "Copy link — rhythm only" : `Copy link — ${count} progression${count === 1 ? "" : "s"}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
