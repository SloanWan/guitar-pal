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
		const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
			// The first state is getUser's. Offline past the access token's life this
			// event carries no session, and would make a signed-in player a guest (#469).
			if (event === "INITIAL_SESSION") return;
			setUser(session?.user ?? null);
		});

		return () => subscription.unsubscribe();
	}, []);

	return { user, loading };
}
