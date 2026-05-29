import { createClient } from "./supabase";
import { PracticeLog } from "@/types/database";

export async function createPracticeLog({
	routineId,
	routineName,
	durationMinutes,
	rating,
	notes,
}: {
	routineId: string | null;
	routineName: string;
	durationMinutes: number | null;
	rating: number | null;
	notes: string | null;
}): Promise<PracticeLog> {
	const supabase = createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) throw new Error("User not authenticated");

	const { data, error } = await supabase
		.from("practice_logs")
		.insert({
			user_id: user.id,
			routine_id: routineId,
			routine_name: routineName,
			duration_minutes: durationMinutes,
			rating,
			notes,
		})
		.select() // return the inserted row
		.single(); // we expect only one row to be inserted

	if (error) throw error;
	return data;
}

export async function getPracticeLogs(): Promise<PracticeLog[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("practice_logs")
		.select("*")
		.order("completed_at", { ascending: false });
	if (error) throw error;
	return data;
}

// note: no need to write update or delete functions for practice logs, since they are immutable records of past practice sessions
