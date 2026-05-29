import { createClient } from "./supabase";
import { ExerciseLog } from "@/types/database";

export async function createExerciseLog({
	exerciseId,
	exerciseName,
	durationMinutes,
	reps,
	notes,
}: {
	exerciseId: string | null;
	exerciseName: string;
	durationMinutes: number | null;
	reps: number | null;
	notes: string | null;
}): Promise<ExerciseLog> {
	const supabase = createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) throw new Error("User not authenticated");
	const { data, error } = await supabase
		.from("exercise_logs")
		.insert({
			user_id: user.id,
			exercise_id: exerciseId,
			exercise_name: exerciseName,
			duration_minutes: durationMinutes,
			reps,
			notes,
		})
		.select() // return the inserted row
		.single(); // we expect only one row to be inserted
	if (error) throw error;
	return data;
}

export async function getExerciseLogs(): Promise<ExerciseLog[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("exercise_logs")
		.select("*")
		.order("logged_at", { ascending: false });
	if (error) throw error;
	return data;
}
