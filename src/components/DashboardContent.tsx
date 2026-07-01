"use client";

import { useState, useEffect } from "react";

import ExerciseList from "@/components/ExerciseList";
import RoutineList from "@/components/RoutineList";
import { Exercise } from "@/types/database";
import { getExercises } from "@/lib/exercises";

export default function DashboardContent() {
	const [loading, setLoading] = useState(true);
	const [allExercises, setAllExercises] = useState<Exercise[]>([]);

	useEffect(() => {
		getExercises()
			.then(setAllExercises)
			.catch(console.error)
			.finally(() => setLoading(false));
	}, []);

	const refreshExercises = () => {
		getExercises().then(setAllExercises).catch(console.error);
	};
	const addExerciseOptimistic = (exercise: Exercise) => {
		setAllExercises((prev) => [exercise, ...prev]);
	};
	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
			<ExerciseList
				exercises={allExercises}
				onExerciseChange={refreshExercises}
				onAddExercise={addExerciseOptimistic}
			/>
			<RoutineList exercises={allExercises} />
		</div>
	);
}
