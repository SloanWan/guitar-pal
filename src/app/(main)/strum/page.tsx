"use client";

import StepGrid from "@/components/strum/StepGrid";
import StepGridCard from "@/components/strum/StepGridCard";
import { PRESET_STRUM_PATTERNS, TickMode, StrumPattern } from "@/lib/strumPatterns";

import { useState, useEffect, useRef } from "react";

import { useAudioEngine } from "@/components/strum/useAudioEngine";
import { Card, CardHeader, CardContent, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

	const [spaceMode, setSpaceMode] = useState<"playPause" | "tapTempo">("playPause");
	const tapTimesRef = useRef<number[]>([]);
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.code === "Space") {
				e.preventDefault();
				if (spaceMode === "playPause") {
					handleHitPlayAndPause();
				} else {
					handleTapTempo();
				}
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isPlaying, spaceMode]);

	useEffect(() => {
		const saved = localStorage.getItem("lastStrumPattern");
		const found = PRESET_STRUM_PATTERNS.find((p) => p.id === saved);
		if (found) setSelectedPattern(found);
	}, []);

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
		localStorage.setItem("lastStrumPattern", pattern.id);
	}

	function handleTapTempo() {
		const now = performance.now();
		const taps = tapTimesRef.current;

		if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
			tapTimesRef.current = [];
		}

		tapTimesRef.current = [...tapTimesRef.current, now].slice(-8);

		if (tapTimesRef.current.length < 2) return;

		const intervals = tapTimesRef.current.slice(1).map((t, i) => t - tapTimesRef.current[i]);
		const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
		const newBpm = Math.round(60000 / avgInterval);
		setBpm(Math.min(MAX_BPM, Math.max(MIN_BPM, newBpm)));
	}

	return (
		<div className="h-[calc(100vh-3.5rem)] flex overflow-hidden bg-slate-50">
			{/* strumming patterns library on the side */}
			<div className="w-72 h-full border-r border-slate-200 bg-white flex flex-col shrink-0">
				<h2 className="w-full px-5 py-4 shrink-0 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
					Strumming Library
				</h2>
				<div className="w-full px-3 py-3 flex-1 overflow-y-auto flex flex-col gap-1.5">
					{PRESET_STRUM_PATTERNS.map((pattern, patternIdx) => {
						const isSelected = selectedPattern.id === pattern.id;
						return (
							<div
								key={patternIdx}
								onClick={() => handleSelectPattern(pattern)}
								className={`cursor-pointer rounded-lg px-3 py-2.5 border-l-[3px] transition-all duration-200 ${
									isSelected
										? "bg-[#EEF2F7] border-l-[#4A6FA5]"
										: "border-l-transparent hover:bg-slate-50 hover:border-l-slate-300"
								}`}
							>
								<div
									className={`capitalize text-[11px] font-semibold mb-2 transition-colors duration-200 ${
										isSelected ? "text-[#4A6FA5]" : "text-slate-500"
									}`}
								>
									{pattern.name}
								</div>
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
			<div className="flex-1 flex flex-col gap-6 items-center pt-8 pb-6 overflow-y-auto">
				{/* pattern display */}
				<div className="w-full flex flex-col items-center gap-3">
					<div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
						Current Pattern
					</div>
					<div className="w-160">
						<StepGridCard
							pattern={selectedPattern}
							activeCell={{ beatIdx: currBeat, cellIdx: currCell }}
						/>
					</div>
				</div>

				{/* Controls Section */}
				<div className="w-160">
					<Card className="shadow-sm border-slate-200">
						<CardHeader className="w-full flex flex-col items-center gap-3 pt-5 pb-4">
							{/* Play / Pause */}
							<CardAction
								onClick={handleHitPlayAndPause}
								className="flex justify-center w-full cursor-pointer text-[#4A6FA5] hover:text-[#3A5A8A] transition-all duration-150 active:scale-95"
							>
								{isPlaying ? (
									<CirclePause size={60} strokeWidth={1.5} />
								) : (
									<CirclePlay size={60} strokeWidth={1.5} />
								)}
							</CardAction>

							{/* Tick mode */}
							<CardAction className="flex gap-2 w-full justify-center">
								<Button
									onClick={() => setTickMode("quarter")}
									variant={tickMode === "quarter" ? "default" : "secondary"}
									className="cursor-pointer h-8 px-4 text-xs font-semibold"
									style={
										tickMode === "quarter"
											? { backgroundColor: "#4A6FA5", color: "white" }
											: {}
									}
								>
									1/4
								</Button>
								<Button
									onClick={() => setTickMode("eighth")}
									variant={tickMode === "eighth" ? "default" : "secondary"}
									className="cursor-pointer h-8 px-4 text-xs font-semibold"
									style={
										tickMode === "eighth"
											? { backgroundColor: "#4A6FA5", color: "white" }
											: {}
									}
								>
									1/8
								</Button>
								<Button
									onClick={() => setTickMode("sixteenth")}
									variant={tickMode === "sixteenth" ? "default" : "secondary"}
									className="cursor-pointer h-8 px-4 text-xs font-semibold"
									style={
										tickMode === "sixteenth"
											? { backgroundColor: "#4A6FA5", color: "white" }
											: {}
									}
								>
									1/16
								</Button>
								{/* <Button>1/3</Button> */}
							</CardAction>
						</CardHeader>

						<CardContent className="flex flex-col items-center gap-5 pb-6">
							{/* BPM Slider */}
							<input
								type="range"
								min={MIN_BPM}
								max={MAX_BPM}
								value={bpm}
								onChange={(e) => setBpm(Number(e.target.value))}
								className="w-full accent-[#4A6FA5] cursor-pointer"
							/>

							{/* add/reduce buttons + BPM display */}
							<div className="w-full flex justify-between items-center">
								<Button
									variant="outline"
									className="h-10 w-10 p-0 rounded-full border-slate-200 hover:border-[#4A6FA5] hover:text-[#4A6FA5] transition-colors duration-150"
									onClick={() => {
										if (bpm - 10 >= MIN_BPM) {
											setBpm(bpm - 10);
										} else {
											setBpm(MIN_BPM);
										}
									}}
								>
									<Minus size={16} />
								</Button>

								<span className="flex flex-col items-center gap-0.5">
									<span className="text-5xl font-bold tracking-tight text-[#4A6FA5]">
										{bpm}
									</span>
									<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
										BPM
									</span>
								</span>

								<Button
									variant="outline"
									className="h-10 w-10 p-0 rounded-full border-slate-200 hover:border-[#4A6FA5] hover:text-[#4A6FA5] transition-colors duration-150"
									onClick={() => {
										if (bpm + 10 <= MAX_BPM) {
											setBpm(bpm + 10);
										} else {
											setBpm(MAX_BPM);
										}
									}}
								>
									<Plus size={16} />
								</Button>
							</div>

							{/* tap tempo */}
							<div className="flex flex-col items-center gap-3">
								<Button
									onClick={handleTapTempo}
									className="h-9 px-8 text-sm font-semibold cursor-pointer"
									style={{ backgroundColor: "#4A6FA5", color: "white" }}
								>
									Tap Tempo
								</Button>
								<div className="flex items-center gap-2.5">
									<span
										className={`text-xs font-medium transition-colors duration-200 ${
											spaceMode === "playPause"
												? "text-[#4A6FA5] font-semibold"
												: "text-slate-400"
										}`}
									>
										Play/Pause
									</span>
									<Switch
										checked={spaceMode === "tapTempo"}
										onCheckedChange={() =>
											setSpaceMode((m) =>
												m === "playPause" ? "tapTempo" : "playPause",
											)
										}
										className="data-[state=checked]:bg-[#4A6FA5] data-[state=unchecked]:bg-[#4A6FA5]"
									/>
									<span
										className={`text-xs font-medium transition-colors duration-200 ${
											spaceMode === "tapTempo"
												? "text-[#4A6FA5] font-semibold"
												: "text-slate-400"
										}`}
									>
										Tap Tempo
									</span>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
