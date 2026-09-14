import NavBar from "@/components/NavBar";

/* Same shell as (main) minus the ⌘K chord search: the topbar keeps the logo
   (the way back to the landing page) and the assistant, but not a sign-in
   CTA pointing at the page the visitor is already on. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<NavBar hideSignIn />
			<main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
		</>
	);
}
