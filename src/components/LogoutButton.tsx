"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth";

/** Signs out, then goes to the landing page; `loading` covers the round trip. */
export function useLogout(): { logout: () => Promise<void>; loading: boolean } {
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	async function logout() {
		setLoading(true);
		try {
			await signOut();
			// Nothing bounces logged-out users off protected pages anymore, so
			// navigate home explicitly, then refresh server components.
			router.push("/");
			router.refresh();
		} catch (error) {
			console.error("Error signing out:", error);
		} finally {
			setLoading(false);
		}
	}

	return { logout, loading };
}
