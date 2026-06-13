import NavBar from "@/components/NavBar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<NavBar />
			<main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
		</>
	);
}
