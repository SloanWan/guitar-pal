import { useState, useEffect } from "react";
import { StrumPattern, Beat } from "@/lib/strumPatterns";
import {
	normalizeBeats,
	normalizeBpm,
	patternBpm,
	patternMeter,
	sortPatternsByNewest,
} from "@/lib/strumBars";
import { normalizeMeter } from "@/lib/strumMeter";
import { patternColumns, STRUM_PATTERNS_STORAGE_KEY } from "@/lib/strumStorage";
import { createClient } from "@/lib/supabase";
import { getUser } from "@/lib/auth";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

/** A Supabase row from `user_strum_patterns`; the table is not code-generated. */
interface StrumPatternRow {
	pattern_id: string;
	name: string;
	beats: Beat[];
	bpm?: unknown;
	/** Absent on every row written before meters existed; reads back as 4/4. */
	meter?: unknown;
	/** Written by the database on insert; what the library orders on. */
	created_at?: string;
}

function rowToPattern(row: StrumPatternRow): StrumPattern {
	return {
		id: row.pattern_id,
		name: row.name,
		beats: normalizeBeats(row.beats),
		bpm: normalizeBpm(row.bpm),
		meter: normalizeMeter(row.meter),
		createdAt: row.created_at,
	};
}

/** Normalize patterns read back from localStorage into the current shape. */
function sanitizeStoredPatterns(patterns: StrumPattern[]): StrumPattern[] {
	return sortPatternsByNewest(patterns).map((p) => ({
		id: p.id,
		name: p.name,
		beats: normalizeBeats(p.beats),
		bpm: patternBpm(p),
		meter: patternMeter(p),
		createdAt: p.createdAt,
	}));
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
		return (data ?? []).map((row) => rowToPattern(row as StrumPatternRow));
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

	useEffect(() => {
		if (!user) return;
		const currentUser = user;

		async function mergeAndReload() {
			const supabase = createClient();
			let merged = false;

			const savedPatterns = localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY);
			if (savedPatterns) {
				try {
					const localPatterns = sanitizeStoredPatterns(
						JSON.parse(savedPatterns) as StrumPattern[],
					);
					const { data: existing } = await supabase
						.from("user_strum_patterns")
						.select("pattern_id")
						.eq("user_id", currentUser.id);
					const existingIds = new Set(
						(existing ?? []).map((r) => r.pattern_id as string),
					);
					const toInsert = localPatterns.filter((p) => !existingIds.has(p.id));
					if (toInsert.length > 0) {
						await supabase.from("user_strum_patterns").insert(
							toInsert.map((p) => ({
								user_id: currentUser.id,
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
						.eq("user_id", currentUser.id);
					const existingFavIds = new Set(
						(existingFavs ?? []).map((r) => r.pattern_id as string),
					);
					const toInsertFavs = localFavIds.filter((id) => !existingFavIds.has(id));
					if (toInsertFavs.length > 0) {
						await supabase.from("user_favourite_patterns").insert(
							toInsertFavs.map((id) => ({ user_id: currentUser.id, pattern_id: id })),
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
				.eq("user_id", currentUser.id)
				// Newest first: the pattern someone just made is the one they are
				// working on, and the database is the only place the creation time
				// is recorded.
				.order("created_at", { ascending: false });
			setCustomPatterns(
				(patterns ?? []).map((row) => rowToPattern(row as StrumPatternRow)),
			);
			setPatternsLoading(false);

			const { data: favs } = await supabase
				.from("user_favourite_patterns")
				.select("pattern_id")
				.eq("user_id", currentUser.id);
			setFavouriteIds((favs ?? []).map((r) => r.pattern_id as string));

			if (merged) {
				toast("Your patterns and favourites have been synced to your account.");
			}
		}

		mergeAndReload();
	}, [user?.id]);

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
						(patterns ?? []).map((row) => rowToPattern(row as StrumPatternRow)),
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
