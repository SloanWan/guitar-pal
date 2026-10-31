import { useState, useEffect } from "react";
import type { StrumPattern } from "@/lib/strumPatterns";
import { patternBpm, patternMeter, sortPatternsByNewest } from "@/lib/strumBars";
import { patternRhythm, withRhythm } from "@/lib/strumRhythm";
import {
	migrateGuestStrumStorage,
	patternColumns,
	patternFromRow,
	STRUM_PATTERNS_STORAGE_KEY,
	type StrumPatternRow,
} from "@/lib/strumStorage";
import { createClient } from "@/lib/supabase";
import { getUser } from "@/lib/auth";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

/** Normalize patterns read back from localStorage into the current shape. */
function sanitizeStoredPatterns(patterns: StrumPattern[]): StrumPattern[] {
	return sortPatternsByNewest(patterns).map((p) =>
		withRhythm(
			{ id: p.id, name: p.name, beats: [], bpm: patternBpm(p), meter: patternMeter(p), createdAt: p.createdAt },
			patternRhythm(p),
		),
	);
}

/**
 * The player's patterns, read once and owned by nobody.
 *
 * The assistant needs to know what "belief" refers to, and it lives in the
 * topbar where this hook does not run. A read is all it needs: the merge, the
 * writes and the invalidation stay here, with the page that owns them.
 */
export async function fetchCustomPatterns(user?: User | null): Promise<StrumPattern[]> {
	// Resolved here when the caller has no user of its own. The panel opens from
	// the topbar, often before any auth state has settled, and a list fetched as
	// a guest and then cached is a library that stays empty for the session.
	const account = user === undefined ? await getUser() : user;
	if (!account) {
		migrateGuestStrumStorage();
		try {
			const saved = localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY);
			return saved ? sanitizeStoredPatterns(JSON.parse(saved) as StrumPattern[]) : [];
		} catch {
			return [];
		}
	}
	try {
		const supabase = createClient();
		const { data } = await supabase
			.from("user_strum_patterns")
			.select("*")
			.eq("user_id", account.id)
			.order("created_at", { ascending: false });
		return (data ?? []).map((row) => patternFromRow(row as StrumPatternRow));
	} catch (e) {
		console.error("[assistant] reading patterns:", e);
		return [];
	}
}

export function useStrumPatterns(user: User | null, loading: boolean) {
	const [customPatterns, setCustomPatterns] = useState<StrumPattern[]>([]);
	const [patternsLoading, setPatternsLoading] = useState(true);
	const [favouriteIds, setFavouriteIds] = useState<string[]>([]);

	useEffect(() => {
		if (loading || user) return;
		migrateGuestStrumStorage();
		let localPatterns: StrumPattern[] = [];
		try {
			const saved = localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY);
			if (saved)
				localPatterns = sanitizeStoredPatterns(JSON.parse(saved) as StrumPattern[]);
		} catch {
			// ignore malformed data
		}
		let localFavIds: string[] = [];
		try {
			const savedFavs = localStorage.getItem("favouritePatternIds");
			if (savedFavs) localFavIds = JSON.parse(savedFavs) as string[];
		} catch {
			// ignore malformed data
		}
		queueMicrotask(() => {
			setCustomPatterns(localPatterns);
			setFavouriteIds(localFavIds);
			setPatternsLoading(false);
		});
	}, [user, loading]);

	const userId = user?.id;
	useEffect(() => {
		if (!userId) return;
		const currentUserId = userId;

		async function mergeAndReload() {
			const supabase = createClient();
			let merged = false;
			// Lifted before the merge, so what reaches the account already plays
			// the way it did in the browser.
			migrateGuestStrumStorage();

			const savedPatterns = localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY);
			if (savedPatterns) {
				try {
					const localPatterns = sanitizeStoredPatterns(
						JSON.parse(savedPatterns) as StrumPattern[],
					);
					const { data: existing } = await supabase
						.from("user_strum_patterns")
						.select("pattern_id")
						.eq("user_id", currentUserId);
					const existingIds = new Set(
						(existing ?? []).map((r) => r.pattern_id as string),
					);
					const toInsert = localPatterns.filter((p) => !existingIds.has(p.id));
					if (toInsert.length > 0) {
						await supabase.from("user_strum_patterns").insert(
							toInsert.map((p) => ({
								user_id: currentUserId,
								pattern_id: p.id,
								...patternColumns(p),
								// Signing in is not creating: carry the times the guest's
								// patterns were actually made, or a whole library would
								// arrive stamped with one moment and lose its order.
								...(p.createdAt ? { created_at: p.createdAt } : {}),
							})),
						);
						merged = true;
					}
					localStorage.removeItem(STRUM_PATTERNS_STORAGE_KEY);
				} catch (e) {
					console.error(e);
				}
			}

			const savedFavs = localStorage.getItem("favouritePatternIds");
			if (savedFavs) {
				try {
					const localFavIds = JSON.parse(savedFavs) as string[];
					const { data: existingFavs } = await supabase
						.from("user_favourite_patterns")
						.select("pattern_id")
						.eq("user_id", currentUserId);
					const existingFavIds = new Set(
						(existingFavs ?? []).map((r) => r.pattern_id as string),
					);
					const toInsertFavs = localFavIds.filter((id) => !existingFavIds.has(id));
					if (toInsertFavs.length > 0) {
						await supabase.from("user_favourite_patterns").insert(
							toInsertFavs.map((id) => ({ user_id: currentUserId, pattern_id: id })),
						);
						merged = true;
					}
					localStorage.removeItem("favouritePatternIds");
				} catch (e) {
					console.error(e);
				}
			}

			const { data: patterns } = await supabase
				.from("user_strum_patterns")
				.select("*")
				.eq("user_id", currentUserId)
				// Newest first: the pattern someone just made is the one they are
				// working on, and the database is the only place the creation time
				// is recorded.
				.order("created_at", { ascending: false });
			setCustomPatterns(
				(patterns ?? []).map((row) => patternFromRow(row as StrumPatternRow)),
			);
			setPatternsLoading(false);

			const { data: favs } = await supabase
				.from("user_favourite_patterns")
				.select("pattern_id")
				.eq("user_id", currentUserId);
			setFavouriteIds((favs ?? []).map((r) => r.pattern_id as string));

			if (merged) {
				toast("Your patterns and favourites have been synced to your account.");
			}
		}

		mergeAndReload();
	}, [userId]);

	function handleSaveCustomPattern(pattern: StrumPattern) {
		if (user) {
			setPatternsLoading(true);
			(async () => {
				try {
					const supabase = createClient();
					const { error } = await supabase.from("user_strum_patterns").insert({
						user_id: user.id,
						pattern_id: pattern.id,
						...patternColumns(pattern),
					});
					if (error) throw new Error(error.message);
					const { data: patterns } = await supabase
						.from("user_strum_patterns")
						.select("*")
						.eq("user_id", user.id)
						.order("created_at", { ascending: false });
					setCustomPatterns(
						(patterns ?? []).map((row) => patternFromRow(row as StrumPatternRow)),
					);
					setPatternsLoading(false);
				} catch (e) {
					console.error(e);
					setPatternsLoading(false);
				}
			})();
		} else {
			// No database to stamp it, so the save does: without a creation time a
			// guest's patterns have no order to be listed in.
			const stamped: StrumPattern = {
				...pattern,
				createdAt: pattern.createdAt ?? new Date().toISOString(),
			};
			const updated = sortPatternsByNewest([...customPatterns, stamped]);
			setCustomPatterns(updated);
			localStorage.setItem(STRUM_PATTERNS_STORAGE_KEY, JSON.stringify(updated));
		}
	}

	function handleEditCustomPattern(updated: StrumPattern) {
		// Editing is not creating: the pattern keeps the time it was made, and
		// therefore its place in the list.
		const next = customPatterns.map((p) =>
			p.id === updated.id ? { ...updated, createdAt: p.createdAt } : p,
		);
		setCustomPatterns(next);
		if (user) {
			(async () => {
				try {
					const supabase = createClient();
					const { error } = await supabase
						.from("user_strum_patterns")
						.update(patternColumns(updated))
						.eq("pattern_id", updated.id)
						.eq("user_id", user.id);
					if (error) throw new Error(error.message);
				} catch (e) {
					console.error(e);
				}
			})();
		} else {
			localStorage.setItem(STRUM_PATTERNS_STORAGE_KEY, JSON.stringify(next));
		}
	}

	function handleDeleteCustomPattern(id: string) {
		const updated = customPatterns.filter((p) => p.id !== id);
		setCustomPatterns(updated);
		localStorage.setItem(STRUM_PATTERNS_STORAGE_KEY, JSON.stringify(updated));

		// A favourite record for a pattern that no longer exists would keep the
		// favourites tab listing a ghost, so it goes with the pattern.
		const wasFavourite = favouriteIds.includes(id);
		if (wasFavourite) {
			const remainingFavs = favouriteIds.filter((favId) => favId !== id);
			setFavouriteIds(remainingFavs);
			localStorage.setItem("favouritePatternIds", JSON.stringify(remainingFavs));
		}

		if (user) {
			(async () => {
				try {
					const supabase = createClient();
					const { error } = await supabase
						.from("user_strum_patterns")
						.delete()
						.eq("pattern_id", id)
						.eq("user_id", user.id);
					if (error) throw new Error(error.message);
					if (wasFavourite) {
						const { error: favError } = await supabase
							.from("user_favourite_patterns")
							.delete()
							.eq("pattern_id", id)
							.eq("user_id", user.id);
						if (favError) throw new Error(favError.message);
					}
				} catch (e) {
					console.error(e);
				}
			})();
		}
	}

	function handleToggleFavourite(patternId: string) {
		const isFav = favouriteIds.includes(patternId);
		const updated = isFav
			? favouriteIds.filter((id) => id !== patternId)
			: [...favouriteIds, patternId];
		setFavouriteIds(updated);
		localStorage.setItem("favouritePatternIds", JSON.stringify(updated));
		if (user) {
			(async () => {
				try {
					const supabase = createClient();
					if (isFav) {
						const { error } = await supabase
							.from("user_favourite_patterns")
							.delete()
							.eq("pattern_id", patternId)
							.eq("user_id", user.id);
						if (error) throw new Error(error.message);
					} else {
						const { error } = await supabase
							.from("user_favourite_patterns")
							.insert({ user_id: user.id, pattern_id: patternId });
						if (error) throw new Error(error.message);
					}
				} catch (e) {
					console.error(e);
				}
			})();
		}
	}

	return {
		customPatterns,
		patternsLoading,
		favouriteIds,
		handleSaveCustomPattern,
		handleEditCustomPattern,
		handleDeleteCustomPattern,
		handleToggleFavourite,
	};
}
