import { createClient } from "@/lib/supabase";
import { readChatSummaries, readSavedMessages, type SavedChatSummary } from "@/lib/assistant/chatLibrary";
import type { StoredMessage } from "@/lib/assistant/conversation";

/**
 * The account's saved assistant chats, `user_assistant_chats` (#401). Signed-in
 * players only; every call throws on a Supabase error.
 */

const TABLE = "user_assistant_chats";

/** Newest first: the chat last talked in leads. */
export async function listChats(userId: string): Promise<SavedChatSummary[]> {
	const { data, error } = await createClient()
		.from(TABLE)
		.select("id, title, updated_at")
		.eq("user_id", userId)
		.order("updated_at", { ascending: false });
	if (error) throw new Error(error.message);
	return readChatSummaries(data);
}

/** The chat's transcript, or null when it is gone. */
export async function loadChat<M extends StoredMessage>(id: string): Promise<M[] | null> {
	const { data, error } = await createClient().from(TABLE).select("messages").eq("id", id).maybeSingle();
	if (error) throw new Error(error.message);
	return data ? readSavedMessages<M>((data as { messages: unknown }).messages) : null;
}

/** Saves a new chat and returns its id. */
export async function createChat(userId: string, title: string, messages: readonly StoredMessage[]): Promise<string> {
	const { data, error } = await createClient()
		.from(TABLE)
		.insert({ user_id: userId, title, messages })
		.select("id")
		.single();
	if (error) throw new Error(error.message);
	return (data as { id: string }).id;
}

/**
 * Writes the conversation over the saved copy, leaving its title: the first
 * question named it, or the player renamed it. False when the chat was deleted meanwhile.
 */
export async function updateChat(id: string, messages: readonly StoredMessage[]): Promise<boolean> {
	const { data, error } = await createClient()
		.from(TABLE)
		.update({ messages, updated_at: new Date().toISOString() })
		.eq("id", id)
		.select("id");
	if (error) throw new Error(error.message);
	return Array.isArray(data) && data.length > 0;
}

/** The player's own name for a chat. Its place in the list (by the last turn) is left as it was. */
export async function renameChat(id: string, title: string): Promise<void> {
	const { error } = await createClient().from(TABLE).update({ title }).eq("id", id);
	if (error) throw new Error(error.message);
}

export async function deleteChat(id: string): Promise<void> {
	const { error } = await createClient().from(TABLE).delete().eq("id", id);
	if (error) throw new Error(error.message);
}
