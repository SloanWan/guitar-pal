"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function LogoutButton({ className }: { className?: string }) {
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	async function handleLogout() {
		setLoading(true);
		try {
			await signOut();
			router.refresh();
		} catch (error) {
			console.error("Error signing out:", error);
		} finally {
			setLoading(false);
		}
	}

	return (
		<button
			type="button"
			onClick={handleLogout}
			disabled={loading}
			className={cn(
				"flex h-(--h-control) items-center gap-2 border border-line-strong px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-[color,background-color,border-color,transform,translate] duration-(--dur-hover) ease-out hover:border-denim hover:text-denim-accent motion-safe:active:translate-y-px active:border-denim active:bg-denim-tint active:duration-(--dur-switch) disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1",
				className,
			)}
		>
			<LogOut
				className="size-3.5 shrink-0"
				strokeWidth={1.5}
				strokeLinecap="square"
			/>
			<span>{loading ? "Logging out…" : "Logout"}</span>
		</button>
	);
}
