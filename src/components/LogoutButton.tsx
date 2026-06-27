"use client";

import { Button } from "@/components/ui/button";
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
		<Button variant="ghost" size="sm" onClick={handleLogout} disabled={loading}>
			<LogOut className="size-4" />
			<span>{loading ? "Logging out..." : "Logout"}</span>
		</Button>
	);
}
