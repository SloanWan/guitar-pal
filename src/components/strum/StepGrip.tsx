import { Beat } from "@/lib/strumPatterns";

import { MoveDown, MoveUp, X, Dot } from "lucide-react";
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card";

const TRIPLET_CSS = "w-6 nav:w-12 flex justify-center px-auto";
const EIGHTH_CSS = "w-8 nav:w-9 flex justify-center px-auto";

const CELL_ARROW_MAP = {
	D: () => <MoveDown className={EIGHTH_CSS} />,
	U: () => <MoveUp className={EIGHTH_CSS} />,
	X: () => <X className={EIGHTH_CSS} />,
	G: () => <div className="w-9"></div>,
	DG: () => <MoveDown className={EIGHTH_CSS} color="#cfcfcf" />,
	UG: () => <MoveUp className={EIGHTH_CSS} color="#cfcfcf" />,
	D3: () => <MoveDown className={TRIPLET_CSS} />,
	U3: () => <MoveUp className={TRIPLET_CSS} />,
	"": () => <Dot className={EIGHTH_CSS} />,
};

const BEAT_LABELS = {
	1: (beatIdx: number) => [`${beatIdx + 1}`, "", "+", ""],
	2: (beatIdx: number) => [`${beatIdx + 1}`, "", "+", ""],
	3: (_beatIdx: number) => ["tri", "p", "let"],
	4: (beatIdx: number) => [`${beatIdx + 1}`, "e", "+", "a"],
};

export default function StepGrid({
	beats,
	name,
	activeCell,
}: {
	beats: Beat[];
	name: string;
	activeCell: {
		beatIdx: number;
		cellIdx: number;
	} | null;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="capitalize">{name}</CardTitle>
			</CardHeader>
			<CardContent>
				{/* container for the whole bar */}
				<div className="flex gap-2">
					{/* map each beat */}
					{beats.map((beat, beatIdx) => {
						const paddedCells =
							beat.length === 1
								? [beat[0], "G", "UG", "G"]
								: beat.length === 2
									? [beat[0], "G", beat[1], "G"]
									: beat;
						const isTriplet = beat.length === 3;
						return (
							// match each cell in this beat
							<div className="flex flex-col gap-2" key={beatIdx}>
								<div className="flex w-24 nav:w-36 border rounded-sm justify-between py-2">
									{paddedCells.map((cell, cellIdx) => {
										const Icon =
											CELL_ARROW_MAP[cell as keyof typeof CELL_ARROW_MAP];
										return <Icon key={cellIdx} />;
									})}
								</div>
								<div className="flex w-24 nav:w-36 justify-between">
									{paddedCells.map((_, cellIdx) => {
										const label =
											BEAT_LABELS[beat.length as keyof typeof BEAT_LABELS](
												beatIdx,
											)[cellIdx];
										return (
											<div
												className={`${isTriplet ? TRIPLET_CSS : EIGHTH_CSS} text-[12px]`}
												key={cellIdx}
											>
												{label}
											</div>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
