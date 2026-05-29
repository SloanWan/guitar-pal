"use client";

import { use, useState } from "react";

import { getRoutineExercises } from "@/lib/routines";

export default function SessionPage({ params }: { params: Promise<{ routineId: string }> }) {
	const { routineId } = use(params);
	const [loading, setLoading] = useState(true);
	const [routineName, setRoutineName] = useState("");

	return (
		<div className="min-h-screen p-8 space-y-6">
			<h1 className="text-xl">Session for routine {routineId}</h1>
		</div>
	);
}
