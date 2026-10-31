import AppShell from "@/components/shell/AppShell";
import ModuleMain from "@/components/ModuleMain";

/* Same shell as (main) minus the ⌘K chord search: the header keeps the logo
   (the way back to the landing page) and the assistant, but not a sign-in
   button pointing at the page the visitor is already on. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
	return (
		<AppShell hideSignIn>
			<ModuleMain className="flex-1 min-h-0 overflow-y-auto">{children}</ModuleMain>
		</AppShell>
	);
}
