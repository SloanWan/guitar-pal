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

	if (error) throw new Error(error.message);
	return data;
}
export async function deleteRoutine(id: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from("routines").delete().eq("id", id);
	if (error) throw new Error(error.message);
}
export async function getRoutines(): Promise<Routine[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("routines")
		.select("*")
		.order("created_at", { ascending: false });
	if (error) throw new Error(error.message);
	return data;
}

export async function getRoutineById(id: string): Promise<Routine> {
	const supabase = createClient();
	const { data, error } = await supabase.from("routines").select("*").eq("id", id).single();
	if (error) throw new Error(error.message);
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
	if (error) throw new Error(error.message);
	return data;
}
export async function removeExerciseFromRoutine(id: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from("routine_exercises").delete().eq("id", id);
	if (error) throw new Error(error.message);
}
export async function updateRoutineExerciseDuration(
	id: string,
	durationMinutes: number,
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from("routine_exercises")
		.update({ duration_minutes: durationMinutes })
		.eq("id", id);
	if (error) throw new Error(error.message);
}
export async function swapRoutineExerciseOrder(id1: string, id2: string): Promise<void> {
	const supabase = createClient();
	const [{ data: exercise1, error: error1 }, { data: exercise2, error: error2 }] =
		await Promise.all([
			supabase.from("routine_exercises").select("*").eq("id", id1).single(),
			supabase.from("routine_exercises").select("*").eq("id", id2).single(),
		]);
	if (error1) throw new Error(error1.message);
	if (error2) throw new Error(error2.message);

	const [{ error: updateError1 }, { error: updateError2 }] = await Promise.all([
		supabase
			.from("routine_exercises")
			.update({ order_index: exercise2.order_index })
			.eq("id", id1),
		supabase
			.from("routine_exercises")
			.update({ order_index: exercise1.order_index })
			.eq("id", id2),
	]);
	if (updateError1) throw new Error(updateError1.message);
	if (updateError2) throw new Error(updateError2.message);
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
	if (error) throw new Error(error.message);
	return data;
}
