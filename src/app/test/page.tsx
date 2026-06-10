"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";

export default function TestPage() {
	const audioCtxRef = useRef<AudioContext | null>(null);
	const audioElementRef = useRef<HTMLAudioElement | null>(null);
	const sourceRef = useRef<MediaElementAudioSourceNode | undefined>(undefined);
	const gainNodeRef = useRef<GainNode | null>(null);
	const panNodeRef = useRef<StereoPannerNode | null>(null);

	const [isPlaying, setIsPlaying] = useState(false);

	// if the audio ends, reset the isPlaying state
	useEffect(() => {
		const audioEl = audioElementRef.current;
		const handleEnded = () => setIsPlaying(false);
		audioEl?.addEventListener("ended", handleEnded);
		return () => {
			audioEl?.removeEventListener("ended", handleEnded);
		};
	}, []);

	const playSound = async () => {
		// Initialize AudioContext and source if they haven't been already
		if (!audioCtxRef.current) {
			audioCtxRef.current = new AudioContext();
		}
		if (!sourceRef.current) {
			gainNodeRef.current = audioCtxRef.current.createGain();
			panNodeRef.current = audioCtxRef.current.createStereoPanner();
			sourceRef.current = audioCtxRef.current.createMediaElementSource(
				audioElementRef.current!,
			);
			sourceRef.current
				.connect(gainNodeRef.current)
				.connect(panNodeRef.current)
				.connect(audioCtxRef.current.destination);
		}

		if (audioCtxRef.current.state === "suspended") {
			await audioCtxRef.current.resume();
		}

		// if the audio is paused, play it; if it's playing, pause it
		if (audioElementRef.current?.paused) {
			audioElementRef.current.play();
		} else {
			audioElementRef.current?.pause();
		}
		setIsPlaying(!audioElementRef.current?.paused);
	};

	return (
		<div className="min-h-screen bg-background flex flex-col items-center justify-center gap-10">
			<h1>Test Page</h1>
			<div className="flex flex-col items-center gap-4">
				<audio
					src="/sounds/random_piano.wav"
					ref={audioElementRef}
					controls
					// crossOrigin="anonymous"
				></audio>
				<Button onClick={playSound} variant="outline">
					{isPlaying ? <Pause /> : <Play />}
				</Button>
				<div className="flex items-center gap-4">
					<label htmlFor="gain" className="text-sm flex flex-col gap-2 items-center">
						Volume
						<input
							type="range"
							min="0"
							max="2"
							step="0.01"
							defaultValue="1"
							className="w-64 accent-primary cursor-pointer"
							onChange={(e) => {
								if (!gainNodeRef.current) return;
								const gainValue = parseFloat(e.target.value);
								gainNodeRef.current!.gain.value = gainValue;
							}}
						/>
					</label>
					<label htmlFor="pan" className="text-sm flex flex-col gap-2 items-center">
						Pan
						<input
							type="range"
							min="-1"
							max="1"
							step="0.01"
							defaultValue="0"
							className="w-64 accent-primary cursor-pointer"
							onChange={(e) => {
								if (!panNodeRef.current) return;
								const panValue = parseFloat(e.target.value);
								panNodeRef.current!.pan.value = panValue;
							}}
						/>
					</label>
				</div>
			</div>
		</div>
	);
}
