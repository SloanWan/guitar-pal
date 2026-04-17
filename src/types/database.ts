export type Category = "chord" | "scale" | "fingering" | "strumming";

export type Exercise = {
	id: string;
	user_id: string;
	title: string;
	category: Category;
	description: string | null;
	created_at: string;
};

export type Routine = {
	id: string;
	user_id: string;
	title: string;
	created_at: string;
};

export type RoutineExercise = {
	id: string;
	routine_id: string;
	exercise_id: string;
	duration_minutes: number;
	order_index: number;
};

export type PracticeLog = {
	id: string;
	user_id: string;
	routine_id: string;
	completed_at: string;
	notes: string | null;
};
