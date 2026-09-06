"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import {
	dedupeUserVoicing,
	rawUserVoicingId,
	rowToUserVoicing,
	userVoicingColumns,
	type UserChordVoicing,
	type UserVoicingRow,
} from "@/lib/userChordVoicings";

/**
 * The chord shapes the player has written, across every chord.
 *
 * Signed out they live in localStorage and are pushed to the account on the
 * first signed-in load, mirroring how `useStrumPatterns` and
 * `useChordProgressions` treat a player who starts before signing up. The list
 * is small enough to hold whole and filter per chord where it is used.
 */

const STORAGE_KEY = "userChordVoicings";

function readStored(): UserChordVoicing[] {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return [];
		// Local storage is as untrusted as the database: the same guard, and the
		// same silent drop for a shape that could not be drawn.
		return (JSON.parse(saved) as UserVoicingRow[])
			.map((row) => rowToUserVoicing({ ...row, id: rawUserVoicingId(row.id) }))
			.filter((v): v is UserChordVoicing => v !== null);
	} catch {
		return [];
	}
}

function writeStored(voicings: UserChordVoicing[]) {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify(voicings.map((v) => userVoicingColumns(v, "local"))),
	);
}

export function useUserChordVoicings(user: User | null, loading: boolean) {
	const [voicings, setVoicings] = useState<UserChordVoicing[]>([]);
	const [voicingsLoading, setVoicingsLoading] = useState(true);

	useEffect(() => {
		if (loading || user) return;
		const local = readStored();
		queueMicrotask(() => {
			setVoicings(local);
			setVoicingsLoading(false);
		});
	}, [user, loading]);

	useEffect(() => {
		if (!user) return;
		const currentUser = user;

		async function mergeAndReload() {
			const supabase = createClient();
			const local = readStored();
			if (local.length > 0) {
				try {
					const { error } = await supabase
						.from("user_chord_voicings")
						.upsert(local.map((v) => userVoicingColumns(v, currentUser.id)));
					if (error) throw new Error(error.message);
					localStorage.removeItem(STORAGE_KEY);
				} catch (e) {
					console.error("[useUserChordVoicings] merge failed:", e);
				}
			}

			// select("*") on purpose: an explicit column list is a second place to
			// remember a new column, and forgetting it fails silently.
			const { data, error } = await supabase
				.from("user_chord_voicings")
				.select("*")
				.eq("user_id", currentUser.id);
			if (error) console.error("[useUserChordVoicings] load failed:", error.message);
			setVoicings(
				(data ?? [])
					.map((row) => rowToUserVoicing(row as UserVoicingRow))
					.filter((v): v is UserChordVoicing => v !== null),
			);
			setVoicingsLoading(false);
		}

		mergeAndReload();
	}, [user?.id]);

	/**
	 * Store a shape and return the row it actually lives in.
	 *
	 * Deduplication happens here rather than at the three places that save, so
	 * none of them can forget it: every save mints a fresh id, so writing the
	 * same grip twice — which takes no more than opening the editor and pressing
	 * apply again — would otherwise file it twice.
	 *
	 * The stored row comes back because its id may differ from the one just
	 * minted, and the caller is about to pin a bar to it.
	 */
	const saveVoicing = useCallback(
		(voicing: UserChordVoicing): UserChordVoicing => {
			const stored = dedupeUserVoicing(voicings, voicing);
			setVoicings((prev) => {
				const next = prev.some((v) => v.id === stored.id)
					? prev.map((v) => (v.id === stored.id ? stored : v))
					: [...prev, stored];
				if (!user) writeStored(next);
				return next;
			});
			if (!user) return stored;
			(async () => {
				try {
					const supabase = createClient();
					const { error } = await supabase
						.from("user_chord_voicings")
						.upsert(userVoicingColumns(stored, user.id));
					if (error) throw new Error(error.message);
				} catch (e) {
					console.error("[useUserChordVoicings] save failed:", e);
				}
			})();
			return stored;
		},
		[user, voicings],
	);

	const deleteVoicing = useCallback(
		(id: string) => {
			setVoicings((prev) => {
				const next = prev.filter((v) => v.id !== id);
				if (!user) writeStored(next);
				return next;
			});
			if (!user) return;
			(async () => {
				try {
					const supabase = createClient();
					const { error } = await supabase
						.from("user_chord_voicings")
						.delete()
						.eq("id", rawUserVoicingId(id))
						.eq("user_id", user.id);
					if (error) throw new Error(error.message);
				} catch (e) {
					console.error("[useUserChordVoicings] delete failed:", e);
				}
			})();
		},
		[user],
	);

	return { voicings, voicingsLoading, saveVoicing, deleteVoicing };
}
