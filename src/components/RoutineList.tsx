"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Play, ChevronRight, ChevronDown, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
	createRoutine,
	getRoutines,
	deleteRoutine,
	getRoutineExercises,
	addExerciseToRoutine,
} from "@/lib/routines";
import { getExercises } from "@/lib/exercises";
import { Routine, RoutineExercise, Exercise, CATEGORIES } from "@/types/database";

type RoutineExerciseWithExercise = RoutineExercise & { exercise: Exercise };

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

export default function RoutineList() {
	const [showForm, setShowForm] = useState(false);
	const [loading, setLoading] = useState(false);
	const [title, setTitle] = useState("");
	const [routines, setRoutines] = useState<Routine[]>([]);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [routineExercisesMap, setRoutineExercisesMap] = useState<
		Record<string, RoutineExerciseWithExercise[]>
	>({});
	const [loadingExercises, setLoadingExercises] = useState<string | null>(null);
	const [allExercises, setAllExercises] = useState<Exercise[]>([]);
	const [selectedCategory, setSelectedCategory] = useState<Exercise["category"] | "">("");
	const [selectedExerciseId, setSelectedExerciseId] = useState<string>("");
	const [duration, setDuration] = useState<number | "">("");

	const router = useRouter();
	const filteredExercises = allExercises.filter((ex) => ex.category === selectedCategory);

	useEffect(() => {
		getRoutines().then(setRoutines);
		getExercises().then(setAllExercises);
	}, []);

	async function handleAddRoutine() {
		if (!title.trim()) return;
		setLoading(true);
		try {
			const routine = await createRoutine(title);
			setRoutines((prev) => [...prev, routine]);
			setTitle("");
			setShowForm(false);
		} catch (error) {
			console.error("Error creating routine:", error);
		} finally {
			setLoading(false);
		}
	}

	async function handleToggleRoutine(routine: Routine) {
		if (expandedId === routine.id) {
			setExpandedId(null);
			return;
		}
		// Reset add-exercise selectors when switching routines
		setSelectedCategory("");
		setSelectedExerciseId("");
		setDuration("");
		setExpandedId(routine.id);
		if (!routineExercisesMap[routine.id]) {
			setLoadingExercises(routine.id);
			try {
				const exercises = await getRoutineExercises(routine.id);
				setRoutineExercisesMap((prev) => ({ ...prev, [routine.id]: exercises }));
			} catch (error) {
				console.error("Error fetching routine exercises:", error);
			} finally {
				setLoadingExercises(null);
			}
		}
	}

	async function handleDeleteRoutine(e: React.MouseEvent, id: string) {
		e.stopPropagation();
		try {
			await deleteRoutine(id);
			setRoutines((prev) => prev.filter((r) => r.id !== id));
			if (expandedId === id) setExpandedId(null);
		} catch (error) {
			console.error("Error deleting routine:", error);
		}
	}

	async function handleAddExerciseToRoutine(routineId: string) {
		if (!selectedExerciseId || !duration) return;
		const exercises = routineExercisesMap[routineId] || [];
		const orderIdx = exercises.length;
		try {
			const newRE = await addExerciseToRoutine(
				routineId,
				selectedExerciseId,
				duration as number,
				orderIdx,
			);
			const exercise = allExercises.find((ex) => ex.id === selectedExerciseId);
			if (!exercise) return;
			setRoutineExercisesMap((prev) => ({
				...prev,
				[routineId]: [...(prev[routineId] || []), { ...newRE, exercise }],
			}));
			setSelectedCategory("");
			setSelectedExerciseId("");
			setDuration("");
		} catch (error) {
			console.error("Error adding exercise to routine:", error);
		}
	}

	return (
		<div className="space-y-4">
			{/* Section header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-base font-semibold">Routines</h2>
					<p className="text-xs text-muted-foreground">{routines.length} total</p>
				</div>
				<Button
					size="sm"
					variant={showForm ? "secondary" : "default"}
					onClick={() => setShowForm((v) => !v)}
				>
					<Plus className="size-3.5" />
					New Routine
				</Button>
			</div>

			{/* Collapsible create form */}
			<AnimatePresence initial={false}>
				{showForm && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
						style={{ overflow: "hidden" }}
					>
						<div className="rounded-xl border border-border bg-card p-4 space-y-3">
							<div className="space-y-1.5">
								<Label className="text-xs">Routine name</Label>
								<Input
									className="h-8 text-xs"
									placeholder="e.g. Morning warmup"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && handleAddRoutine()}
								/>
							</div>
							<div className="flex justify-end gap-2">
								<Button
									size="sm"
									variant="outline"
									onClick={() => setShowForm(false)}
								>
									Cancel
								</Button>
								<Button
									size="sm"
									disabled={loading || !title.trim()}
									onClick={handleAddRoutine}
								>
									{loading ? "Creating..." : "Create"}
								</Button>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Routines list */}
			<div className="rounded-xl border border-border bg-card overflow-hidden">
				{routines.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No routines yet. Create one to get started.
					</div>
				) : (
					<AnimatePresence initial={false}>
						{routines.map((routine, i) => {
							const isExpanded = expandedId === routine.id;
							const exercises = routineExercisesMap[routine.id] || [];
							const totalMins = exercises.reduce(
								(sum, re) => sum + re.duration_minutes,
								0,
							);

							return (
								<motion.div
									key={routine.id}
									className={i < routines.length - 1 ? "border-b border-border" : ""}
								>
									{/* Routine header row */}
									<div
										className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-muted/40 transition-colors"
										onClick={() => handleToggleRoutine(routine)}
									>
										<div className="flex items-center gap-2 min-w-0">
											{isExpanded ? (
												<ChevronDown className="size-4 text-muted-foreground shrink-0" />
											) : (
												<ChevronRight className="size-4 text-muted-foreground shrink-0" />
											)}
											<span className="text-sm font-medium truncate">
												{routine.title}
											</span>
											{exercises.length > 0 && (
												<span className="text-xs text-muted-foreground shrink-0">
													{exercises.length} ex · {totalMins}m
												</span>
											)}
										</div>
										<div className="flex items-center gap-1 shrink-0">
											<Button
												size="sm"
												variant="secondary"
												onClick={(e) => {
													e.stopPropagation();
													router.push(`/session/${routine.id}`);
												}}
											>
												<Play className="size-3.5" />
												Start
											</Button>
											<Button
												size="icon-sm"
												variant="ghost"
												onClick={(e) => handleDeleteRoutine(e, routine.id)}
												className="text-muted-foreground hover:text-destructive"
											>
												<Trash2 className="size-3.5" />
											</Button>
										</div>
									</div>

									{/* Expanded panel */}
									<AnimatePresence initial={false}>
										{isExpanded && (
											<motion.div
												initial={{ height: 0, opacity: 0 }}
												animate={{ height: "auto", opacity: 1 }}
												exit={{ height: 0, opacity: 0 }}
												transition={{ duration: 0.2, ease: "easeInOut" }}
												style={{ overflow: "hidden" }}
											>
												<div
													className="px-4 pb-4 space-y-3 border-t border-border bg-muted/20"
													onClick={(e) => e.stopPropagation()}
												>
													{/* Exercise list */}
													{loadingExercises === routine.id ? (
														<p className="text-xs text-muted-foreground pt-3">
															Loading...
														</p>
													) : exercises.length > 0 ? (
														<div className="space-y-1.5 pt-3">
															{exercises.map((re) => (
																<div
																	key={re.id}
																	className="flex items-center justify-between text-xs"
																>
																	<div className="flex items-center gap-2">
																		<span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
																			{
																				CATEGORY_LABELS[
																					re.exercise
																						.category
																				]
																			}
																		</span>
																		<span>{re.exercise.title}</span>
																	</div>
																	<div className="flex items-center gap-1 text-muted-foreground">
																		<Clock className="size-3" />
																		<span>
																			{re.duration_minutes}m
																		</span>
																	</div>
																</div>
															))}
														</div>
													) : (
														<p className="text-xs text-muted-foreground pt-3">
															No exercises added yet.
														</p>
													)}

													{/* Add exercise */}
													<div className="space-y-2 pt-1">
														<p className="text-xs font-medium text-muted-foreground">
															Add exercise
														</p>
														<div className="grid grid-cols-2 gap-2">
															<Select
																value={selectedCategory}
																onValueChange={(v) => {
																	setSelectedCategory(
																		v as Exercise["category"],
																	);
																	setSelectedExerciseId("");
																}}
															>
																<SelectTrigger className="h-7 text-xs">
																	<SelectValue placeholder="Category" />
																</SelectTrigger>
																<SelectContent>
																	{CATEGORIES.map((cat) => (
																		<SelectItem
																			key={cat}
																			value={cat}
																			className="text-xs"
																		>
																			{CATEGORY_LABELS[cat]}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
															<Select
																value={selectedExerciseId}
																onValueChange={setSelectedExerciseId}
																disabled={
																	!selectedCategory ||
																	filteredExercises.length === 0
																}
															>
																<SelectTrigger className="h-7 text-xs">
																	<SelectValue
																		placeholder={
																			!selectedCategory
																				? "Pick category first"
																				: filteredExercises.length ===
																					  0
																					? "None in category"
																					: "Exercise"
																		}
																	/>
																</SelectTrigger>
																<SelectContent>
																	{filteredExercises.map((ex) => (
																		<SelectItem
																			key={ex.id}
																			value={ex.id}
																			className="text-xs"
																		>
																			{ex.title}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</div>
														<div className="flex gap-2">
															<Input
																type="number"
																className="h-7 text-xs"
																placeholder="Duration (min)"
																value={duration}
																onChange={(e) =>
																	setDuration(Number(e.target.value))
																}
															/>
															<Button
																size="sm"
																disabled={
																	!selectedCategory ||
																	!selectedExerciseId ||
																	!duration
																}
																onClick={() =>
																	handleAddExerciseToRoutine(
																		routine.id,
																	)
																}
															>
																Add
															</Button>
														</div>
													</div>
												</div>
											</motion.div>
										)}
									</AnimatePresence>
								</motion.div>
							);
						})}
					</AnimatePresence>
				)}
			</div>
		</div>
	);
}
