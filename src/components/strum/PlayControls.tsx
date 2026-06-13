import { StrumPattern } from "@/lib/strumPatterns";

import { useState } from "react";

import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Plus, Minus } from "lucide-react";

const MIN_BPM = 40;
const MAX_BPM = 220;

export default function PlayControls({ pattern }: { pattern: StrumPattern }) {
	const [bpm, setBpm] = useState(80);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Play Controls</CardTitle>
			</CardHeader>
			<CardContent>
				{/* BPM Slider */}
				<input
					type="range"
					min={MIN_BPM}
					max={MAX_BPM}
					value={bpm}
					onChange={(e) => setBpm(Number(e.target.value))}
				/>
				{/* add/reduce buttons */}
				<div>
					<Button
						onClick={() => {
							if (bpm - 10 >= MIN_BPM) {
								setBpm(bpm - 10);
							} else {
								setBpm(MIN_BPM);
							}
						}}
					>
						<Minus />
					</Button>
					<span>Curr bpm: {bpm}</span>
					<Button
						onClick={() => {
							if (bpm + 10 <= MAX_BPM) {
								setBpm(bpm + 10);
							} else {
								setBpm(MAX_BPM);
							}
						}}
					>
						<Plus />
					</Button>
				</div>
				{/* tap tempo */}
				<Button>Tap Tempooo</Button>
			</CardContent>
		</Card>
	);
}
