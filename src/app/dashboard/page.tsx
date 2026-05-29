import ExerciseList from "@/components/ExerciseList";
import RoutineList from "@/components/RoutineList";

import { createSupabaseServer } from "@/lib/supabase-server";

export default async function DashboardPage() {
	const supabase = await createSupabaseServer();

	const {
		data: { user },
	} = await supabase.auth.getUser();

	return (
		<div className="min-h-screen p-8 space-y-6">
			<h1 className="text-xl">Guitar Pal</h1>
			<p>Welcome to your online guitar studio space</p>
			<p>
				Hello, <b>{user?.email}</b> :)
			</p>
			<ExerciseList />
			<RoutineList />
		</div>
	);
}
