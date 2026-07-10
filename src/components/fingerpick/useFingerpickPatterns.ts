import { useState, useEffect } from "react";
import { FingerpickPattern } from "@/lib/fingerpickTypes";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { createClient } from "@/lib/supabase";
import {
	loadUserFingerpickPatterns,
	saveUserFingerpickPattern,
	deleteUserFingerpickPattern,
	mergeLocalFingerpickPatternsToSupabase,
} from "@/lib/fingerpickPatternSync";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

const LOCAL_STORAGE_KEY = "favouriteFingerpickPatternIds";

export function useFingerpickPatterns(user: User | null, loading: boolean) {
	const [selectedPattern, setSelectedPattern] = useState<FingerpickPattern>(
		PRESET_FINGERPICK_PATTERNS[0],
	);
	const [customPatterns, setCustomPatterns] = useState<FingerpickPattern[]>([]);
	const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	// Logged-out path: read favourites and custom patterns from localStorage.
	useEffect(() => {
		if (loading || user) return;
		let localFavIds: string[] = [];
		try {
			const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
			if (saved) localFavIds = JSON.parse(saved) as string[];
		} catch {
			// ignore malformed data
		}
		const supabase = createClient();
		loadUserFingerpickPatterns(supabase, null)
			.then((patterns) => {
				setCustomPatterns(patterns);
			})
			.catch((e) => console.error(e))
			.finally(() => {
				setFavouriteIds(localFavIds);
				setIsLoading(false);
			});
	}, [user, loading]);

	// Logged-in path: merge any localStorage data into Supabase, then load.
	useEffect(() => {
		if (!user) return;
		const currentUser = user;

		async function mergeAndReload() {
			const supabase = createClient();
			let merged = false;

			// Merge favourites.
			const savedFavs = localStorage.getItem(LOCAL_STORAGE_KEY);
			if (savedFavs) {
				try {
					const localFavIds = JSON.parse(savedFavs) as string[];
					const { data: existingFavs } = await supabase
						.from("user_favourite_fingerpick_patterns")
						.select("pattern_id")
						.eq("user_id", currentUser.id);
					const existingFavIds = new Set(
						(existingFavs ?? []).map((r) => r.pattern_id as string),
					);
					const toInsert = localFavIds.filter((id) => !existingFavIds.has(id));
					if (toInsert.length > 0) {
						await supabase
							.from("user_favourite_fingerpick_patterns")
							.insert(toInsert.map((id) => ({ user_id: currentUser.id, pattern_id: id })));
						merged = true;
					}
					localStorage.removeItem(LOCAL_STORAGE_KEY);
				} catch (e) {
					console.error(e);
				}
			}

			// Merge custom patterns.
			try {
				const migratedCount = await mergeLocalFingerpickPatternsToSupabase(
					supabase,
					currentUser,
				);
				if (migratedCount > 0) merged = true;
			} catch (e) {
				console.error(e);
			}

			try {
				const patterns = await loadUserFingerpickPatterns(supabase, currentUser);
				setCustomPatterns(patterns);
			} catch (e) {
				console.error(e);
			}

			const { data: favs } = await supabase
				.from("user_favourite_fingerpick_patterns")
				.select("pattern_id")
				.eq("user_id", currentUser.id);
			setFavouriteIds((favs ?? []).map((r) => r.pattern_id as string));
			setIsLoading(false);

			if (merged) {
				toast("Your fingerpick patterns have been synced to your account.");
			}
		}

		mergeAndReload();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user?.id]);

	function toggleFavourite(patternId: string) {
		const isFav = favouriteIds.includes(patternId);
		const updated = isFav
			? favouriteIds.filter((id) => id !== patternId)
			: [...favouriteIds, patternId];
		setFavouriteIds(updated);
		if (!user) {
			localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
		}
		if (user) {
			(async () => {
				try {
					const supabase = createClient();
					if (isFav) {
						const { error } = await supabase
							.from("user_favourite_fingerpick_patterns")
							.delete()
							.eq("pattern_id", patternId)
							.eq("user_id", user.id);
						if (error) throw new Error(error.message);
					} else {
						const { error } = await supabase
							.from("user_favourite_fingerpick_patterns")
							.insert({ user_id: user.id, pattern_id: patternId });
						if (error) throw new Error(error.message);
					}
				} catch (e) {
					console.error(e);
				}
			})();
		}
	}

	// Insert or update a custom pattern (create + edit both route here).
	function saveCustomPattern(pattern: FingerpickPattern) {
		setCustomPatterns((prev) => {
			const idx = prev.findIndex((p) => p.id === pattern.id);
			if (idx === -1) return [...prev, pattern];
			return prev.map((p) => (p.id === pattern.id ? pattern : p));
		});
		if (selectedPattern.id === pattern.id) setSelectedPattern(pattern);
		(async () => {
			try {
				const supabase = createClient();
				await saveUserFingerpickPattern(supabase, user, pattern);
			} catch (e) {
				console.error(e);
			}
		})();
	}

	function deleteCustomPattern(patternId: string) {
		setCustomPatterns((prev) => prev.filter((p) => p.id !== patternId));
		if (selectedPattern.id === patternId) setSelectedPattern(PRESET_FINGERPICK_PATTERNS[0]);
		(async () => {
			try {
				const supabase = createClient();
				await deleteUserFingerpickPattern(supabase, user, patternId);
			} catch (e) {
				console.error(e);
			}
		})();
	}

	// Presets plus any user-created patterns; presets stay first.
	const patterns = [...PRESET_FINGERPICK_PATTERNS, ...customPatterns];

	return {
		patterns,
		customPatterns,
		selectedPattern,
		setSelectedPattern,
		favouriteIds,
		toggleFavourite,
		saveCustomPattern,
		deleteCustomPattern,
		isLoading,
	};
}
