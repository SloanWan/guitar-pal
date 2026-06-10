import { Beat } from "@/lib/strumPatterns";

import { MoveDown, MoveUp, X, Dot } from "lucide-react";
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card";

const CELL_ARROW_MAP = {
	D: () => <MoveDown className="w-9 flex justify-center px-auto" />,
	U: () => <MoveUp className="w-9 flex justify-center px-auto" />,
	X: () => <X className="w-9 flex justify-center px-auto" />,
	G: () => <div className="w-9"></div>,
	DG: () => <MoveDown className="w-9 flex justify-center px-auto" color="#cfcfcf" />,
	UG: () => <MoveUp className="w-9 flex justify-center px-auto" color="#cfcfcf" />,
	D3: () => <MoveDown className="w-12 flex justify-center px-auto" />,
	U3: () => <MoveUp className="w-12 flex justify-center px-auto" />,
	"": () => <Dot className="w-9 flex justify-center px-auto" />,
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
				<CardTitle>{name}</CardTitle>
			</CardHeader>
			<CardContent>
				{/* container for the whole bar */}
				<div className="flex">
					{/* map each beat */}
					{beats.map((beat, beatIdx) => {
						const paddedCells =
							beat.length === 1
								? [beat[0], "G", "UG", "G"]
								: beat.length === 2
									? [beat[0], "G", beat[1], "G"]
									: beat;
						return (
							// match each cell in this beat
							<div key={beatIdx} className="flex w-36 border justify-between py-2">
								{paddedCells.map((cell, cellIdx) => {
									const Icon =
										CELL_ARROW_MAP[cell as keyof typeof CELL_ARROW_MAP];
									return <Icon key={cellIdx} />;
								})}
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
