"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth";

export default function LogoutButton() {
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
			className="flex items-center gap-2 border border-line-strong px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors duration-150 hover:border-denim hover:text-denim-accent active:border-denim active:bg-denim-tint disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
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
