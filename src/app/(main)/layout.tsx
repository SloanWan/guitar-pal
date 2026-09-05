import NavBar from "@/components/NavBar";
import ChordSearchDialog from "@/components/chords/ChordSearchDialog";

export default function MainLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<NavBar />
			<main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
			{/* ⌘K from anywhere in the app, not only under /chords. Its index is
			    fetched on first open, so pages nobody searches from pay nothing. */}
			<ChordSearchDialog />
		</>
	);
}
