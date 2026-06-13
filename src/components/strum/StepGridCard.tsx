import { Beat } from "@/lib/strumPatterns";

import { MoveDown, MoveUp, X, Dot } from "lucide-react";
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card";
import StepGrid from "./StepGrid";

export default function StepGridCard({
	beats,
	name,
	activeCell,
	size = "md",
	showLabels = true,
}: {
	beats: Beat[];
	name: string;
	activeCell: {
		beatIdx: number;
		cellIdx: number;
	} | null;
	size?: "sm" | "md"; // default md
	showLabels?: boolean; // default true
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="capitalize">{name}</CardTitle>
			</CardHeader>
			<CardContent>
				<StepGrid beats={beats} activeCell={null} />
			</CardContent>
		</Card>
	);
}
