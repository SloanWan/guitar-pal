"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { CircleX, ChevronRight, ChevronDown } from "lucide-react";

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

export default function RoutineList() {
	const [loading, setLoading] = useState(false);
	const [title, setTitle] = useState("");
	const [routines, setRoutines] = useState<Routine[]>([]);
	const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
	const [routineExercises, setRoutineExercises] = useState<RoutineExerciseWithExercise[]>([]);
	const [routineExercisesLoading, setRoutineExercisesLoading] = useState(false);
	const [allExercises, setAllExercises] = useState<Exercise[]>([]);
	const [selectedCategory, setSelectedCategory] = useState<Exercise["category"] | "">("");
	const [selectedExerciseId, setSelectedExerciseId] = useState<string | "">("");
	const [duration, setDuration] = useState<number | "">("");

	const filteredExercises = allExercises.filter((ex) => ex.category === selectedCategory);

	const router = useRouter();

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
		} catch (error) {
			console.error("Error creating routine:", error);
		} finally {
			setLoading(false);
		}
	}

	async function handleSelectRoutine(routine: Routine) {
		if (selectedRoutine?.id === routine.id) {
			setSelectedRoutine(null);
			setRoutineExercises([]);
			return;
		}
		setSelectedRoutine(routine);
		setRoutineExercisesLoading(true);
		try {
			const exercises = await getRoutineExercises(routine.id);
			setRoutineExercises(exercises);
		} catch (error) {
			console.error("Error fetching routine exercises:", error);
		} finally {
			setRoutineExercisesLoading(false);
		}
	}

	async function handleDeleteRoutine(e: React.MouseEvent, id: string) {
		e.stopPropagation();
		try {
			await deleteRoutine(id);
			setRoutines((prev) => prev.filter((r) => r.id !== id));
			if (selectedRoutine?.id === id) {
				setSelectedRoutine(null);
			}
		} catch (error) {
			console.error("Error deleting routine:", error);
		}

		// past todo: handle deleting exercises in this routine as well
		// -> handled by 'on delete cascade' in db, so no need to manually delete routine exercises here
	}

	async function handleAddExercisesToRoutine() {
		if (!selectedRoutine || !selectedExerciseId || !duration) return;
		const orderIdx = routineExercises.length;
		try {
			const newRoutineExercise = await addExerciseToRoutine(
				selectedRoutine.id,
				selectedExerciseId,
				duration,
				orderIdx,
			);
			const exercise = allExercises.find((ex) => ex.id === selectedExerciseId);
			if (!exercise) return; // this should never happen since we select from existing exercises, but just in case
			setRoutineExercises((prev) => [...prev, { ...newRoutineExercise, exercise }]);
			setSelectedCategory("");
			setSelectedExerciseId("");
			setDuration("");
		} catch (error) {
			console.error("Error adding exercise to routine:", error);
		}
	}

	return (
		<div className="space-y-6">
			{/* create routine form */}
			<Card>
				<CardHeader>
					<CardTitle>Create Routine</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<div className="space-y-2">
						<Label>Title of this routine</Label>
						<Input
							placeholder="e.g. Come back routine"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</div>
					<Button className="mt-4" disabled={loading} onClick={handleAddRoutine}>
						{loading ? "Adding..." : "Add Routine"}
					</Button>
				</CardContent>
			</Card>

			{/* display all routines */}
			<Card>
				<CardHeader>
					<CardTitle>All Routines</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{routines.length ? (
						routines.map((routine) => (
							<Card
								key={routine.id}
								onClick={() => handleSelectRoutine(routine)}
								className={`cursor-pointer select-none ${selectedRoutine?.id === routine.id ? "bg-gray-200/50" : ""}`}
							>
								<CardContent>
									{/* routine header */}
									<div className="flex gap-2 capitalize justify-between">
										<div className="flex items-center gap-1">
											{selectedRoutine?.id === routine.id ? (
												<ChevronDown size={16} />
											) : (
												<ChevronRight size={16} />
											)}
											{routine.title}
											<Button
												size="sm"
												variant="secondary"
												onClick={(e) => {
													e.stopPropagation();
													router.push(`/session/${routine.id}`);
												}}
												className="cursor-pointer hover:bg-gray-300/50"
											>
												Start Session
											</Button>
										</div>
										<Button
											// note: BIG FIX HERE: we need to stop propagation to prevent triggering the select routine when trying to delete
											onClick={(e) => handleDeleteRoutine(e, routine.id)}
											variant="destructive"
										>
											<CircleX />
										</Button>
									</div>
									{/* expanded content */}
									{selectedRoutine?.id === routine.id && (
										<div
											className="mt-2 text-sm text-muted-foreground"
											onClick={(e) => e.stopPropagation()}
										>
											{/* curr routine exercise list */}
											{/* no modification buttons */}
											{/* NOTE: big fix here -> add loading state */}
											{routineExercisesLoading ? (
												<div className="py-2 text-sm text-muted-foreground">
													Loading exercises...
												</div>
											) : routineExercises.length ? (
												routineExercises.map((re) => (
													<div
														key={re.id}
														className="flex justify-between"
													>
														<div>
															{re.exercise.category}:{" "}
															{re.exercise.title} -{" "}
															{re.duration_minutes} mins
														</div>
													</div>
												))
											) : (
												<div>No exercises found.</div>
											)}
											{/* add ex */}
											{/* TODO: "no exercises found" -> add button -> open selection */}
											{/* TODO: with exercises list -> update button to allow add and remove */}
											{/* curr: select category -> select exercise -> add to routine */}
											<div className="flex gap-2 mt-2 items-center">
												<Select
													value={selectedCategory}
													onValueChange={(value) => {
														setSelectedCategory(
															value as Exercise["category"],
														);
														setSelectedExerciseId("");
													}}
												>
													<SelectTrigger>
														<SelectValue placeholder="Select a category" />
													</SelectTrigger>
													<SelectContent>
														{CATEGORIES.map((cat) => (
															<SelectItem key={cat} value={cat}>
																{cat.charAt(0).toUpperCase() +
																	cat.slice(1).replace("_", " ")}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												{/* the exercise selection in curr category */}
												{selectedCategory &&
													(filteredExercises.length ? (
														// show exercises in this category
														<div className="flex gap-2 items-center">
															<Select
																value={selectedExerciseId || ""}
																onValueChange={
																	setSelectedExerciseId
																}
															>
																<SelectTrigger>
																	<SelectValue placeholder="Select an exercise" />
																</SelectTrigger>
																<SelectContent>
																	{filteredExercises.map((ex) => (
																		<SelectItem
																			key={ex.id}
																			value={ex.id}
																		>
																			{ex.title}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
															{/* show duration input and add button */}
															<Input
																type="number"
																placeholder="Duration (minutes)"
																value={duration}
																onChange={(e) =>
																	setDuration(
																		Number(e.target.value),
																	)
																}
															/>
															<span>mins</span>
															<Button
																onClick={
																	handleAddExercisesToRoutine
																}
																disabled={
																	!(
																		selectedCategory &&
																		selectedExerciseId &&
																		duration
																	)
																}
															>
																Add
															</Button>
														</div>
													) : (
														<div>No exercises in this category.</div>
													))}
											</div>
										</div>
									)}
								</CardContent>
							</Card>
						))
					) : (
						<div>No routines found.</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
