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

	// Exercises are fetched client-side, so the server render (and any route-level
	// fallback) can't cover this wait — gate on `loading` and show a skeleton in
	// the two-column shape instead of rendering empty lists until data arrives.
	if (loading) {
		return (
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8" aria-hidden="true">
				{[0, 1].map((col) => (
					<div key={col} className="flex flex-col gap-4">
						<div className="h-8 w-40 animate-pulse rounded bg-denim-tint" />
						{[0, 1, 2, 3].map((row) => (
							<div
								key={row}
								className="h-16 animate-pulse rounded bg-denim-tint"
							/>
						))}
					</div>
				))}
			</div>
		);
	}

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
