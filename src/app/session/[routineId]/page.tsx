"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { getRoutineById, getRoutineExercises } from "@/lib/routines";
import { Routine, Exercise, RoutineExercise } from "@/types/database";
import { createPracticeLog } from "@/lib/practiceLogs";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Play,
	Pause,
	SkipForward,
	Repeat,
	RotateCcw,
	ArrowLeft,
	Star,
	CheckCircle2,
	Clock,
} from "lucide-react";

type RoutineExerciseWithExercise = RoutineExercise & { exercise: Exercise };
type SessionStatus = "idle" | "running" | "paused" | "completed" | "all_done";

const CATEGORY_LABELS: Record<string, string> = {
	chord: "Chord",
	chord_change: "Chord Change",
	picking: "Picking",
	scale: "Scale",
	strumming: "Strumming",
	fingering: "Fingering",
	ear_training: "Ear Training",
	arpeggio: "Arpeggio",
	theory: "Theory",
	song: "Song",
};

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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

	useEffect(() => {
		const fetchData = async () => {
			setLoading(true);
			try {
				const [r, exs] = await Promise.all([
					getRoutineById(routineId),
					getRoutineExercises(routineId),
				]);
				setRoutine(r);
				setRoutineExercises(exs);
				if (exs.length > 0) setSecondsLeft(exs[0].duration_minutes * 60);
			} catch (e) {
				console.error(e);
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [routineId]);

	const currentExercise = routineExercises[currentExerciseIndex];
	const nextExercise = routineExercises[currentExerciseIndex + 1] || null;
	const progressPct =
		routineExercises.length > 0 ? (currentExerciseIndex / routineExercises.length) * 100 : 0;

	useEffect(() => {
		if (status !== "running" || secondsLeft <= 0) return;
		// Effect reruns each second (secondsLeft in deps), so the closure value
		// is always current — no stale reads.
		const id = setInterval(() => {
			if (secondsLeft <= 1) {
				setStatus(nextExercise ? "completed" : "all_done");
			}
			setSecondsLeft((prev) => Math.max(0, prev - 1));
			setTotalSecondsElapsed((t) => t + 1);
		}, 1000);
		return () => clearInterval(id);
	}, [status, secondsLeft, nextExercise]);

	function handleExtendTime() {
		setSecondsLeft((s) => s + 30);
	}
	function handleReduceTime() {
		setSecondsLeft((s) => Math.max(0, s - 30));
	}

	function handlePauseContinue() {
		setStatus((s) => (s === "running" ? "paused" : "running"));
	}
	function handleSkip() {
		if (nextExercise) {
			setCurrentExerciseIndex((i) => i + 1);
			setSecondsLeft(routineExercises[currentExerciseIndex + 1].duration_minutes * 60);
			setStatus("idle");
		} else {
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

	async function handleConfirm() {
		setSaving(true);
		try {
			await createPracticeLog({
				routineId,
				routineName: routine?.title || "Unknown Routine",
				durationMinutes: Math.round(totalSecondsElapsed / 60),
				rating,
				notes: notes.trim() || null,
			});
			router.push("/dashboard");
		} catch (e) {
			console.error(e);
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-sm text-muted-foreground">Loading session...</p>
			</div>
		);
	}

	if (!routine || routineExercises.length === 0) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center gap-4">
				<p className="text-sm text-muted-foreground">
					Routine not found or has no exercises.
				</p>
				<Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
					<ArrowLeft className="size-4" />
					Back to dashboard
				</Button>
			</div>
		);
	}

	/* ── Completion screen ── */
	if (status === "all_done") {
		return (
			<div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
				<motion.div
					initial={{ opacity: 0, scale: 0.95 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.25 }}
					className="w-full max-w-md space-y-6"
				>
					{/* Hero */}
					<div className="text-center space-y-2">
						<div className="flex justify-center">
							<div className="size-14 rounded-2xl bg-amber-100 flex items-center justify-center">
								<CheckCircle2 className="size-7 text-amber-700" />
							</div>
						</div>
						<h1 className="text-2xl font-semibold">Session complete!</h1>
						<p className="text-sm text-muted-foreground">{routine.title}</p>
					</div>

					{/* Stats */}
					<div className="flex justify-center gap-8">
						<div className="text-center">
							<p className="text-2xl font-mono font-semibold">
								{formatTime(totalSecondsElapsed)}
							</p>
							<p className="text-xs text-muted-foreground mt-0.5">Total time</p>
						</div>
						<div className="text-center">
							<p className="text-2xl font-semibold">{routineExercises.length}</p>
							<p className="text-xs text-muted-foreground mt-0.5">Exercises</p>
						</div>
					</div>

					{/* Rating & notes */}
					<Card>
						<CardContent className="pt-4 pb-5 space-y-4">
							<div className="space-y-2">
								<p className="text-sm font-medium">How did it feel?</p>
								<div className="flex gap-1">
									{[1, 2, 3, 4, 5].map((n) => (
										<button
											key={n}
											onClick={() => setRating(n)}
											className="p-0.5 transition-transform hover:scale-110 active:scale-95"
										>
											<Star
												className={`size-7 transition-colors ${
													rating !== null && n <= rating
														? "fill-amber-400 text-amber-400"
														: "text-muted-foreground"
												}`}
											/>
										</button>
									))}
								</div>
							</div>
							<div className="space-y-1.5">
								<p className="text-sm font-medium">
									Notes{" "}
									<span className="text-muted-foreground font-normal">
										(optional)
									</span>
								</p>
								<textarea
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
									placeholder="How did the session go?"
									rows={3}
									className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
								/>
							</div>
						</CardContent>
					</Card>

					{/* Actions */}
					<div className="flex gap-3">
						<Button
							variant="outline"
							className="flex-1"
							onClick={() => router.push("/dashboard")}
						>
							Skip &amp; Exit
						</Button>
						<Button
							className="flex-1"
							disabled={saving || rating === null}
							onClick={handleConfirm}
						>
							{saving ? "Saving..." : "Save session"}
						</Button>
					</div>
					<Button
						variant="ghost"
						className="w-full text-muted-foreground text-sm"
						onClick={() => {
							setStatus("idle");
							setCurrentExerciseIndex(0);
							setSecondsLeft(routineExercises[0].duration_minutes * 60);
							setTotalSecondsElapsed(0);
							setRating(null);
							setNotes("");
						}}
					>
						<Repeat className="size-4" />
						Repeat this routine
					</Button>
				</motion.div>
			</div>
		);
	}

	/* ── Active session screen ── */
	const isLowTime = secondsLeft <= 10 && secondsLeft > 0 && status === "running";

	return (
		<div className="min-h-screen bg-background flex flex-col">
			{/* Progress bar */}
			<div className="h-0.5 bg-border">
				<motion.div
					className="h-full bg-amber-400"
					animate={{ width: `${progressPct}%` }}
					transition={{ duration: 0.4, ease: "easeOut" }}
				/>
			</div>

			{/* Header */}
			<header className="relative flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border">
				<Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
					<ArrowLeft className="size-4" />
					<span className="hidden sm:inline">Dashboard</span>
				</Button>
				<div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
					<p className="text-sm font-medium">{routine.title}</p>
					<p className="text-xs text-muted-foreground">
						Exercise {currentExerciseIndex + 1} of {routineExercises.length}
					</p>
				</div>
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
					<Clock className="size-3.5" />
					<span>{formatTime(totalSecondsElapsed)}</span>
				</div>
			</header>

			{/* Main content */}
			<main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 gap-10 max-w-lg mx-auto w-full">
				{/* Current exercise */}
				<AnimatePresence mode="wait">
					<motion.div
						key={currentExerciseIndex}
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -16 }}
						transition={{ duration: 0.2 }}
						className="text-center space-y-3 w-full"
					>
						<span className="inline-flex items-center rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
							{CATEGORY_LABELS[currentExercise?.exercise.category] ??
								currentExercise?.exercise.category}
						</span>
						<h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
							{currentExercise?.exercise.title}
						</h1>
						{currentExercise?.exercise.description && (
							<p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
								{currentExercise.exercise.description}
							</p>
						)}
					</motion.div>
				</AnimatePresence>

				{/* Timer */}
				<div className="text-center">
					<p
						className={`text-7xl sm:text-8xl font-mono font-semibold tabular-nums tracking-tight transition-colors duration-300 ${
							isLowTime ? "text-amber-500" : ""
						}`}
					>
						{formatTime(secondsLeft)}
					</p>
					<div className="flex items-center justify-center gap-2 mt-3">
						<Button
							size="sm"
							variant="outline"
							onClick={handleReduceTime}
							disabled={secondsLeft <= 30}
						>
							−30s
						</Button>
						<Button size="sm" variant="outline" onClick={handleExtendTime}>
							+30s
						</Button>
					</div>

					<p className="text-xs text-muted-foreground mt-2 capitalize">
						{status === "idle"
							? "Ready"
							: status === "running"
								? "Running"
								: status === "paused"
									? "Paused"
									: "Time's up!"}
					</p>
				</div>

				{/* Controls */}
				<div className="flex items-center gap-4">
					{status === "completed" ? (
						<Button
							size="icon-lg"
							variant="outline"
							onClick={handleRepeat}
							title="Repeat exercise"
						>
							<Repeat className="size-5" />
						</Button>
					) : (
						<>
							<Button
								size="icon-lg"
								variant="outline"
								onClick={handleReset}
								title="Reset timer"
							>
								<RotateCcw className="size-5" />
							</Button>
							<Button
								size="icon"
								onClick={handlePauseContinue}
								className="size-16 rounded-full"
								title={status === "running" ? "Pause" : "Start"}
							>
								{status === "running" ? (
									<Pause className="size-6" />
								) : (
									<Play className="size-6" />
								)}
							</Button>
						</>
					)}
					<Button
						size="icon-lg"
						variant="outline"
						onClick={handleSkip}
						title="Skip exercise"
					>
						<SkipForward className="size-5" />
					</Button>
				</div>

				{/* Next up */}
				{nextExercise ? (
					<div className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3">
						<p className="text-xs text-muted-foreground mb-1.5">Up next</p>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2 min-w-0">
								<span className="shrink-0 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
									{CATEGORY_LABELS[nextExercise.exercise.category]}
								</span>
								<span className="text-sm font-medium truncate">
									{nextExercise.exercise.title}
								</span>
							</div>
							<span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
								<Clock className="size-3" />
								{nextExercise.duration_minutes}m
							</span>
						</div>
					</div>
				) : (
					<p className="text-xs text-muted-foreground">Last exercise</p>
				)}
			</main>
		</div>
	);
}
