import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Everything a player owns, and how "delete my data" and "delete my account"
 * remove it. Runs on the server with the service role: the client's own RLS
 * policies don't all allow deletes, and the auth user can only go through the
 * admin API.
 *
 * Every foreign key to `auth.users` already cascades (#220), so deleting the
 * auth user alone would take the rows with it. The wipe runs first anyway, for
 * three reasons: "delete my data" keeps the user, Storage files are not rows
 * and nothing cascades into them, and `routine_exercises.exercise_id` is
 * `ON DELETE RESTRICT`, which a single cascading delete can trip over when it
 * reaches the exercises before the routines.
 */

/** One table's rows for a player: removed, or (for shared contributions) kept without a name on them. */
export interface UserTable {
	table: string;
	column: string;
	action: "delete" | "anonymise";
}

/**
 * In order: a table comes after anything that holds a RESTRICT key to it.
 * Child tables reached only through a parent (`routine_exercises`, the book
 * chapters, pages and chunks) are cascaded from it and not listed.
 */
export const USER_TABLES: readonly UserTable[] = [
	{ table: "exercise_logs", column: "user_id", action: "delete" },
	{ table: "practice_logs", column: "user_id", action: "delete" },
	{ table: "routines", column: "user_id", action: "delete" },
	{ table: "exercises", column: "user_id", action: "delete" },
	{ table: "user_strum_patterns", column: "user_id", action: "delete" },
	{ table: "user_favourite_patterns", column: "user_id", action: "delete" },
	{ table: "user_pattern_progressions", column: "user_id", action: "delete" },
	{ table: "user_fingerpick_patterns", column: "user_id", action: "delete" },
	{ table: "user_favourite_fingerpick_patterns", column: "user_id", action: "delete" },
	{ table: "user_last_pattern", column: "user_id", action: "delete" },
	{ table: "user_chord_voicings", column: "user_id", action: "delete" },
	{ table: "user_favourite_chords", column: "user_id", action: "delete" },
	{ table: "user_books", column: "user_id", action: "delete" },
	{ table: "shared_items", column: "owner_id", action: "delete" },
	// A chord request is a suggestion for the shared library: the account
	// deletion sets it null (the FK is ON DELETE SET NULL), and so does this.
	{ table: "chord_requests", column: "user_id", action: "anonymise" },
];

/** The private bucket the book PDFs and their crops live in, under `<user id>/`. */
export const USER_FILE_BUCKETS: readonly string[] = ["books"];

const LIST_PAGE = 1000;

/**
 * Every file path under `prefix`, walking folders: Storage lists one level at a
 * time, and a folder comes back as an entry with no id.
 */
async function listFiles(client: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
	const files: string[] = [];
	for (let offset = 0; ; offset += LIST_PAGE) {
		const { data, error } = await client.storage.from(bucket).list(prefix, { limit: LIST_PAGE, offset });
		if (error) throw new Error(`Listing ${bucket}/${prefix} failed: ${error.message}`);
		for (const entry of data) {
			const path = `${prefix}/${entry.name}`;
			if (entry.id === null) files.push(...(await listFiles(client, bucket, path)));
			else files.push(path);
		}
		if (data.length < LIST_PAGE) return files;
	}
}

/** Removes every file the player has in Storage. Returns how many went. */
export async function removeUserFiles(client: SupabaseClient, userId: string): Promise<number> {
	let removed = 0;
	for (const bucket of USER_FILE_BUCKETS) {
		const paths = await listFiles(client, bucket, userId);
		for (let i = 0; i < paths.length; i += LIST_PAGE) {
			const batch = paths.slice(i, i + LIST_PAGE);
			const { error } = await client.storage.from(bucket).remove(batch);
			if (error) throw new Error(`Removing files from ${bucket} failed: ${error.message}`);
			removed += batch.length;
		}
	}
	return removed;
}

/**
 * Deletes (or anonymises) every row the player owns and every file they
 * stored, keeping the account itself. Throws on the first failure; what ran
 * before it stays done, and running it again finishes the job.
 */
export async function wipeUserData(client: SupabaseClient, userId: string): Promise<void> {
	if (!userId) throw new Error("No user id");
	for (const { table, column, action } of USER_TABLES) {
		const query =
			action === "delete"
				? client.from(table).delete().eq(column, userId)
				: client.from(table).update({ [column]: null }).eq(column, userId);
		const { error } = await query;
		if (error) throw new Error(`Clearing ${table} failed: ${error.message}`);
	}
	await removeUserFiles(client, userId);
}

/** The wipe, then the auth user. After this the player's session is dead. */
export async function deleteAccount(client: SupabaseClient, userId: string): Promise<void> {
	await wipeUserData(client, userId);
	const { error } = await client.auth.admin.deleteUser(userId);
	if (error) throw new Error(`Deleting the account failed: ${error.message}`);
}
