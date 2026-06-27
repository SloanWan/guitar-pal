"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

export function useUser(): { user: User | null; loading: boolean } {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		getUser().then((u) => {
			setUser(u);
			setLoading(false);
		});

		const supabase = createClient();
		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
			setUser(session?.user ?? null);
		});

		return () => subscription.unsubscribe();
	}, []);

	return { user, loading };
}
