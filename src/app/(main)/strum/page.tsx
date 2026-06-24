"use client";

import StepGrid from "@/components/strum/StepGrid";
import StepGridCard from "@/components/strum/StepGridCard";
import { PRESET_STRUM_PATTERNS, TickMode, StrumPattern } from "@/lib/strumPatterns";

import { useState, useEffect } from "react";

import { useAudioEngine } from "@/components/strum/useAudioEngine";
import { Card, CardHeader, CardContent, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Minus, CirclePlay, CirclePause } from "lucide-react";

const MIN_BPM = 40;
const MAX_BPM = 220;

export default function StrumPage() {
	const [selectedPattern, setSelectedPattern] = useState(PRESET_STRUM_PATTERNS[0]);
	const [bpm, setBpm] = useState(80);
	const [tickMode, setTickMode] = useState<TickMode>("quarter");

	const { isPlaying, start, stop, currBeat, currCell } = useAudioEngine(
		selectedPattern.beats,
		bpm,
		tickMode,
	);

	function handleHitPlayAndPause() {
		if (isPlaying) {
			stop();
		} else {
			start();
		}
	}

	function handleSelectPattern(pattern: StrumPattern) {
		stop();
		setSelectedPattern(pattern);
	}

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.code === "Space") {
				e.preventDefault();
				handleHitPlayAndPause();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isPlaying]);

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
								onClick={() => handleSelectPattern(pattern)}
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
				<div className="w-full flex flex-col items-center gap-4">
					<div>Current Pattern</div>
					<div className="w-160">
						<StepGridCard
							pattern={selectedPattern}
							activeCell={{ beatIdx: currBeat, cellIdx: currCell }}
						/>
					</div>
				</div>
				{/* Controls Section */}
				<div className="w-160">
					<Card>
						<CardHeader className="w-full flex flex-col items-center">
							<CardAction onClick={handleHitPlayAndPause} className="w-full">
								{isPlaying ? <CirclePause size={48} /> : <CirclePlay size={48} />}
							</CardAction>
							<CardAction>
								<Button
									onClick={() => {
										setTickMode("quarter");
									}}
									variant={`${tickMode === "quarter" ? "default" : "secondary"}`}
									className="cursor-pointer"
								>
									1/4
								</Button>
								<Button
									onClick={() => {
										setTickMode("eighth");
									}}
									variant={`${tickMode === "eighth" ? "default" : "secondary"}`}
									className="cursor-pointer"
								>
									1/8
								</Button>
								<Button
									onClick={() => {
										setTickMode("sixteenth");
									}}
									variant={`${tickMode === "sixteenth" ? "default" : "secondary"}`}
									className="cursor-pointer"
								>
									1/16
								</Button>
								{/* <Button>1/3</Button> */}
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
				</div>
			</div>
		</div>
	);
}
