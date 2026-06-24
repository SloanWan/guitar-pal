import { StrumPattern } from "@/lib/strumPatterns";

import { Card, CardContent, CardTitle, CardHeader, CardDescription } from "@/components/ui/card";
import StepGrid from "./StepGrid";

export default function StepGridCard({
	pattern,
	activeCell,
}: {
	pattern: StrumPattern;
	activeCell: {
		beatIdx: number;
		cellIdx: number;
	} | null;
}) {
	return (
		<Card className="shadow-sm border-slate-200">
			<CardHeader className="border-b border-slate-100 px-5 py-4">
				<CardTitle className="capitalize text-base font-semibold text-slate-800">
					{pattern.name}
				</CardTitle>
				<CardDescription className="text-xs text-slate-400 mt-0.5">
					{pattern.description}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col items-center px-5 py-5">
				<StepGrid beats={pattern.beats} activeCell={activeCell} />
			</CardContent>
		</Card>
	);
}
