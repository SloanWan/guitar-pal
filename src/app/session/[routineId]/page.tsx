"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { getRoutineById, getRoutineExercises } from "@/lib/routines";
import { Routine, Exercise, RoutineExercise } from "@/types/database";
import { createPracticeLog } from "@/lib/practiceLogs";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Timer, Play, Pause, SkipForward, Repeat, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type RoutineExerciseWithExercise = RoutineExercise & { exercise: Exercise };
type SessionStatus = "idle" | "running" | "paused" | "completed" | "all_done";

export default function SessionPage({ params }: { params: Promise<{ routineId: string }> }) {
	const { routineId } = use(params);
	const router = useRouter();

	const [status, setStatus] = useState<SessionStatus>("idle");
	const [routine, setRoutine] = useState<Routine | null>(null);
	const [routineExercises, setRoutineExercises] = useState<RoutineExerciseWithExercise[]>([]);
	const [loading, setLoading] = useState(true);
	const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
	const [secondsLeft, setSecondsLeft] = useState(0);

	const [totalSecondsElapsed, setTotalSecondsElapsed] = useState(0);
	const [rating, setRating] = useState<number | null>(null);
	const [notes, setNotes] = useState("");
	const [saving, setSaving] = useState(false);

	const fetchRoutineData = async () => {
		setLoading(true);
		try {
			const [routine, routineExercises] = await Promise.all([
				getRoutineById(routineId),
				getRoutineExercises(routineId),
			]);
			setRoutine(routine);
			setRoutineExercises(routineExercises);
			if (routineExercises.length > 0) {
				setSecondsLeft(routineExercises[0].duration_minutes * 60);
			}
		} catch (error) {
			console.error("Error fetching routine data:", error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchRoutineData();
	}, [routineId]);

	const currentExercise = routineExercises[currentExerciseIndex];
	const nextExercise = routineExercises[currentExerciseIndex + 1] || null;

	useEffect(() => {
		if (status != "running") return;
		if (secondsLeft <= 0) {
			if (nextExercise) {
				setStatus("completed");
			} else {
				setStatus("all_done");
			}
			return;
		}

		const timerId = setInterval(() => {
			setSecondsLeft((prev) => prev - 1);
			setTotalSecondsElapsed((prev) => prev + 1);
		}, 1000);

		return () => clearInterval(timerId);
	}, [status, secondsLeft]);

	function handlePauseContinue() {
		setStatus((prev) => (prev === "running" ? "paused" : "running"));
	}
	function handleSkip() {
		if (nextExercise) {
			setCurrentExerciseIndex((prev) => prev + 1);
			setSecondsLeft(routineExercises[currentExerciseIndex + 1].duration_minutes * 60);
			setStatus("idle");
		} else {
			// No more exercises, end session
			setStatus("all_done");
		}
	}
	function handleRepeat() {
		setSecondsLeft(
			currentExercise?.duration_minutes ? currentExercise.duration_minutes * 60 : 0,
		);
		setStatus("idle");
	}
	function handleReset() {
		setSecondsLeft(
			currentExercise?.duration_minutes ? currentExercise.duration_minutes * 60 : 0,
		);
		setStatus("idle");
	}

	function handleAbandon() {
		router.push("/dashboard");
	}
	async function handleConfirm() {
		setSaving(true);
		try {
			await createPracticeLog({
				routineId: routineId,
				routineName: routine?.title || "Unknown Routine",
				durationMinutes: Math.round(totalSecondsElapsed / 60),
				rating: rating,
				notes: notes.trim() || null,
			});
			router.push("/dashboard");
		} catch (error) {
			console.error("Error creating practice log:", error);
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div className="min-h-screen p-8 max-w-2xl mx-auto flex flex-col items-center">
				<div>Loading...</div>
			</div>
		);
	}
	if (!routine || routineExercises.length === 0) {
		return (
			<div className="min-h-screen p-8 max-w-2xl mx-auto flex flex-col items-center">
				<div>Routine not found or has no exercises.</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen p-8 max-w-4xl mx-auto flex flex-col items-center gap-4">
			<h1 className="text-xl">{routine?.title}</h1>
			<p>Status: {status}</p>
			{status == "all_done" ? (
				<div className="flex flex-col items-center gap-4">
					<p className="font-bold">Congratulations! You've completed the routine!</p>
					<p>
						Total practice time: {Math.floor(totalSecondsElapsed / 60)}:
						{String(totalSecondsElapsed % 60).padStart(2, "0")} min
					</p>
					{/* Rating */}
					<div className="flex items-center gap-2">
						<label htmlFor="rating" className="block text-md font-medium text-black">
							Rate your performance (1-5) *:
						</label>
						<div className="mt-1 flex gap-2">
							{[1, 2, 3, 4, 5].map((num) => (
								<button
									key={num}
									onClick={() => setRating(num)}
									className={`px-3 py-1 rounded ${
										rating === num
											? "bg-black text-white"
											: "bg-gray-200 hover:bg-gray-300"
									}`}
								>
									{num}
								</button>
							))}
						</div>
					</div>
					{/* Notes */}
					<div className="flex gap-2 w-full">
						<label className="text-md">Notes (optional):</label>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Add any notes about your practice session..."
							className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-md p-4"
						/>
					</div>
					{/* buttons */}
					<div className="w-full flex justify-between">
						<Button variant="outline" onClick={handleAbandon}>
							Abandon
						</Button>
						<Button onClick={handleConfirm} disabled={saving || rating === null}>
							{saving ? "Saving..." : "Confirm"}
						</Button>
					</div>
					<Button
						onClick={() => {
							setStatus("idle");
							setCurrentExerciseIndex(0);
							setSecondsLeft(routineExercises[0].duration_minutes * 60);
						}}
					>
						Repeat this routine
					</Button>
				</div>
			) : (
				<>
					<Card className="w-2xl">
						<CardHeader>
							<CardTitle className="flex justify-between items-center">
								<span>
									{currentExerciseIndex + 1}. {currentExercise?.exercise.category}
									: {currentExercise?.exercise.title}
								</span>
								<span className="flex items-center gap-2">
									<Timer className="w-4 h-4" />
									{currentExercise?.duration_minutes} min
								</span>
							</CardTitle>
							<CardDescription>
								{currentExercise?.exercise.description}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col items-center gap-4">
							<p>Time left: {secondsLeft}s</p>
							<div className="flex gap-2">
								{status != "completed" && (
									<div>
										<Button onClick={handlePauseContinue}>
											{status === "running" ? <Pause /> : <Play />}
										</Button>
									</div>
								)}
								{status == "completed" && (
									<Button onClick={handleRepeat}>
										<Repeat className="w-4 h-4" />
									</Button>
								)}
								{status == "running" && (
									<Button onClick={handleReset}>
										<RotateCcw className="w-4 h-4" />
									</Button>
								)}
								<Button onClick={handleSkip}>
									<SkipForward className="w-4 h-4" />
								</Button>
							</div>
						</CardContent>
					</Card>
					{nextExercise ? (
						<Card className="w-2xl">
							<CardHeader>
								<CardTitle className="flex justify-between items-center">
									<span>
										Next: {nextExercise.exercise.category}:{" "}
										{nextExercise.exercise.title}
									</span>
									<span className="flex items-center gap-2">
										<Timer className="w-4 h-4" />
										{nextExercise.duration_minutes} min
									</span>
								</CardTitle>
								<CardDescription>
									{nextExercise.exercise.description}
								</CardDescription>
							</CardHeader>
						</Card>
					) : (
						<div>No more exercises.</div>
					)}
				</>
			)}
		</div>
	);
}
