import { Beat, StrumPattern } from "@/lib/strumPatterns";

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
		<Card>
			<CardHeader className="border-b mx-2 text-left">
				<CardTitle className="capitalize">{pattern.name}</CardTitle>
				<CardDescription>{pattern.description}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col items-center">
				<StepGrid beats={pattern.beats} activeCell={null} />
			</CardContent>
		</Card>
	);
}
