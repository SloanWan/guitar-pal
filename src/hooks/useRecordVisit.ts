"use client";

import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { recordVisit, type VisitKind } from "@/lib/visits";

/** Counts a visit to `target` once it is known (null while it is not) — for Home's "Most opened". */
export function useRecordVisit(user: User | null, kind: VisitKind, target: string | null): void {
	const userId = user?.id;
	useEffect(() => {
		if (!user || target === null) return;
		recordVisit(createClient(), user, kind, target).catch(console.error);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- a token refresh hands back a new user object for the same account
	}, [userId, kind, target]);
}
