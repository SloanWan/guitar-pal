"use client";

import StepGrid from "@/components/strum/StepGrid";
import StepGridCard from "@/components/strum/StepGridCard";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";
import PlayControls from "@/components/strum/PlayControls";

import { useState } from "react";

export default function StrumPage() {
	const [selectedPattern, setSelectedPattern] = useState(PRESET_STRUM_PATTERNS[0]);

	return (
		<div className="h-[calc(100vh-3.5rem)] flex overflow-hidden">
			{/* strumming patterns library on the side */}
			<div className="w-80 h-full border-r flex flex-col">
				<h2 className="w-full py-4 text-center shrink-0 border-b">Strumming Library</h2>
				<div className="w-full px-4 py-3 flex-1 overflow-y-auto flex flex-col gap-3">
					{PRESET_STRUM_PATTERNS.map((pattern, patternIdx) => {
						return (
							<div
								key={patternIdx}
								onClick={() => setSelectedPattern(pattern)}
								className={`${selectedPattern.id === pattern.id ? "bg-amber-100" : ""} cursor-pointer border rounded-md p-3 hover:bg-amber-100/50 transition-all duration-300`}
							>
								<div className="capitalize text-[12px]">{pattern.name}</div>
								<StepGrid
									beats={pattern.beats}
									activeCell={null}
									size="sm"
									showLabels={false}
								/>
							</div>
						);
					})}
				</div>
			</div>
			{/* main practice section */}
			<div className="flex-1 flex flex-col gap-4 items-center pt-5">
				{/* pattern display */}
				<div className="flex flex-col items-center gap-4">
					<div>Current Pattern</div>
					<div>
						<StepGridCard pattern={selectedPattern} activeCell={null} />
					</div>
				</div>
				<div>
					<PlayControls pattern={selectedPattern} />
				</div>
			</div>
		</div>
	);
}
