import DashboardContent from "@/components/DashboardContent";

export default function DashboardPage() {
	return (
		<div className="min-h-screen bg-background">
			{/* Main content — two-column grid on large screens */}
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
				<DashboardContent />
			</main>
		</div>
	);
}
