import ExerciseList from "@/components/ExerciseList";
import RoutineList from "@/components/RoutineList";
import LogoutButton from "@/components/LogoutButton";
import { createSupabaseServer } from "@/lib/supabase-server";
import { Music } from "lucide-react";

export default async function DashboardPage() {
	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	return (
		<div className="min-h-screen bg-background">
			{/* Sticky header */}
			<header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
				<div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="flex items-center justify-center size-7 rounded-lg bg-amber-100 text-amber-700">
							<Music className="size-4" />
						</div>
						<span className="font-semibold text-sm tracking-tight">Guitar Pal</span>
					</div>
					<div className="flex items-center gap-3">
						<span className="text-sm text-muted-foreground hidden sm:block">
							{user?.email}
						</span>
						<LogoutButton />
					</div>
				</div>
			</header>

			{/* Main content — two-column grid on large screens */}
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<ExerciseList />
					<RoutineList />
				</div>
			</main>
		</div>
	);
}
