import { createClient } from "./supabase";
import { Exercise, Routine, RoutineExercise } from "@/types/database";

export async function createRoutine(title: string): Promise<Routine> {
	const supabase = createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) throw new Error("User not authenticated");

	const { data, error } = await supabase
		.from("routines")
		.insert({ title, user_id: user.id })
		.select()
		.single();

	if (error) throw error;
	return data;
}
export async function deleteRoutine(id: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from("routines").delete().eq("id", id);
	if (error) throw error;
}
export async function getRoutines(): Promise<Routine[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("routines")
		.select("*")
		.order("created_at", { ascending: false });
	if (error) throw error;
	return data;
}

export async function getRoutineById(id: string): Promise<Routine> {
	const supabase = createClient();
	const { data, error } = await supabase.from("routines").select("*").eq("id", id).single();
	if (error) throw error;
	return data;
}

export async function addExerciseToRoutine(
	routineId: string,
	exerciseId: string,
	durationMinutes: number,
	orderIndex: number,
): Promise<RoutineExercise> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("routine_exercises")
		.insert({
			routine_id: routineId,
			exercise_id: exerciseId,
			duration_minutes: durationMinutes,
			order_index: orderIndex,
		})
		.select()
		.single();
	if (error) throw error;
	return data;
}
export async function removeExerciseFromRoutine(id: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from("routine_exercises").delete().eq("id", id);
	if (error) throw error;
}
export async function getRoutineExercises(
	routineId: string,
): Promise<(RoutineExercise & { exercise: Exercise })[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("routine_exercises")
		.select("*, exercise:exercises(*)") // Select all fields from routine_exercises and join exercise table
		.eq("routine_id", routineId)
		.order("order_index", { ascending: true });
	if (error) throw error;
	return data;
}
