import { StrumPattern } from "@/lib/strumPatterns";

import { useState } from "react";

import { Card, CardHeader, CardTitle, CardContent, CardAction } from "../ui/card";
import { Button } from "../ui/button";
import { Plus, Minus, CirclePlay, CirclePause } from "lucide-react";

const MIN_BPM = 40;
const MAX_BPM = 220;

export default function PlayControls({ pattern }: { pattern: StrumPattern }) {
	const [bpm, setBpm] = useState(80);
	const [isPlaying, setIsPlaying] = useState(false);

	function handleHitPlayAndPause() {
		setIsPlaying(!isPlaying);
	}

	return (
		<Card>
			<CardHeader className="flex justify-center">
				{/* <CardTitle>Play Controls</CardTitle> */}
				<CardAction onClick={handleHitPlayAndPause} className="">
					{isPlaying ? <CirclePause size={48} /> : <CirclePlay size={48} />}
				</CardAction>
			</CardHeader>
			<CardContent className="flex flex-col items-center gap-3">
				{/* BPM Slider */}
				<input
					type="range"
					min={MIN_BPM}
					max={MAX_BPM}
					value={bpm}
					onChange={(e) => setBpm(Number(e.target.value))}
					className="w-full"
				/>
				{/* add/reduce buttons */}
				<div className="w-full flex justify-between items-center">
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
					<span className="flex flex-col items-center gap-1">
						<span className="text-[24px]">{bpm}</span>
						<span>BPM</span>
					</span>
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
