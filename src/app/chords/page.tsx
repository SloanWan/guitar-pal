import NavBar from "@/components/NavBar";

export default function ChordsPage() {
	return (
		<div className="min-h-screen bg-background">
			<NavBar />
			<h1 className="text-3xl font-bold text-center py-10">Chords Library</h1>
			<p className="text-center text-muted-foreground">
				Explore and practice various guitar chords. More features coming soon!
			</p>
		</div>
	);
}
