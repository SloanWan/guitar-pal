export const CATEGORIES = [
	"chord",
	"chord_change",
	"picking",
	"scale",
	"strumming",
	"fingering",
	"ear_training",
	"arpeggio",
	"theory",
	"song",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Exercise = {
	id: string;
	user_id: string;
	title: string;
	category: Category;
	description: string | null;
	target_bpm: number | null;
	stage: number;
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
	routine_id: string | null;
	routine_name: string;
	duration_minutes: number | null;
	rating: number | null;
	notes: string | null;
	completed_at: string;
};

export type ExerciseLog = {
	id: string;
	user_id: string;
	exercise_id: string | null;
	exercise_name: string;
	duration_minutes: number | null;
	reps: number | null;
	notes: string | null;
	logged_at: string;
};
