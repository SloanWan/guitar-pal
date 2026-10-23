import AppShell from "@/components/shell/AppShell";

/* Same shell as (main) minus the ⌘K chord search: the header keeps the logo
   (the way back to the landing page) and the assistant, but not a sign-in
   button pointing at the page the visitor is already on. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
	return (
		<AppShell hideSignIn>
			<main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
		</AppShell>
	);
}
