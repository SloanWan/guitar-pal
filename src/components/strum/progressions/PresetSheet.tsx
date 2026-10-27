"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { SearchInput } from "@/components/ui/input";
import { PROGRESSION_PRESETS, filterPresets, groupPresets, type ProgressionPreset } from "@/lib/strumProgressionPresets";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (preset: ProgressionPreset) => void;
}

/**
 * Known progressions to start from, over the page: grouped, narrowed by a search
 * on name or chords. Picking one makes it a progression of the open pattern.
 */
export default function PresetSheet({ open, onOpenChange, onPick }: Props) {
	const [query, setQuery] = useState("");
	const groups = groupPresets(filterPresets(PROGRESSION_PRESETS, query));
	return (
		<Sheet open={open} onOpenChange={onOpenChange} title="Start from a preset">
			<div className="flex flex-col gap-3" data-m="strum">
				<SearchInput
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search by name or chords"
					aria-label="Search presets"
				/>
				{groups.length === 0 && <p className="st-lab m-0">No preset matches “{query.trim()}”.</p>}
				{groups.map(({ group, presets }) => (
					<section key={group} className="flex flex-col gap-1" aria-label={group}>
						<h3 className="st-pgroup">{group}</h3>
						{presets.map((preset) => (
							<button key={preset.id} type="button" className="st-pitem" onClick={() => onPick(preset)}>
								<span className="flex items-baseline justify-between gap-2">
									<span className="st-pitem-name">{preset.name}</span>
									<span className="st-lab shrink-0">{preset.degrees}</span>
								</span>
								<span className="st-lab">{preset.chords}</span>
							</button>
						))}
					</section>
				))}
			</div>
		</Sheet>
	);
}
