import DashboardContent from "@/components/DashboardContent";

import { createSupabaseServer } from "@/lib/supabase-server";

export default async function DashboardPage() {
	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	return (
		<div className="min-h-screen bg-background">
			{/* Main content — two-column grid on large screens */}
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
				<DashboardContent />
			</main>
		</div>
	);
}
