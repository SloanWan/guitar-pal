"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/lib/auth";

export default function LogoutButton() {
	const [loading, setLoading] = useState(false);
	// const [error, setError] = useState(null);
	const router = useRouter();

	async function handleLogout() {
		setLoading(true);
		try {
			await signOut();
			router.push("/auth");
		} catch (error) {
			console.error("Error signing out:", error);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div>
			<Button variant="outline" onClick={handleLogout} disabled={loading}>
				{loading ? "Logging out..." : "Logout"}
			</Button>
		</div>
	);
}
