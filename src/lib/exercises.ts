import { createClient } from "@/lib/supabase";
import { Exercise } from "@/types/database";

export async function createExercise(
	title: string,
	category: Exercise["category"],
	description: string | null,
): Promise<Exercise> {
	const supabase = createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) throw new Error("User not authenticated");

	const { data, error } = await supabase
		.from("exercises")
		.insert({
			user_id: user.id,
			title,
			category,
			description: description || null,
		})
		.select() // return the inserted row
		.single(); // we expect only one row to be inserted
	if (error) throw new Error(error.message);
	return data;
}

export async function deleteExercise(exerciseId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from("exercises").delete().eq("id", exerciseId);
	if (error) throw new Error(error.message);
}
export async function removeAllRoutineExercisesByExerciseId(exerciseId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from("routine_exercises")
		.delete()
		.eq("exercise_id", exerciseId);
	if (error) throw new Error(error.message);
}

export async function getExercises(): Promise<Exercise[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("exercises")
		.select("*") // select all columns
		.order("created_at", { ascending: false });
	if (error) throw new Error(error.message);
	return data;
}

export async function getRoutineNamesForExercise(exerciseId: string): Promise<string[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("routine_exercises")
		.select("routines(title)")
		.eq("exercise_id", exerciseId);
	if (error) throw new Error(error.message);
	return (data as unknown as { routines: { title: string } }[]).map(
		(item) => item.routines.title,
	);
}
