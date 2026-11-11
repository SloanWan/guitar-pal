import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";

/**
 * Offline, a signed-in library is read-only (#469): its copy can be shown, but
 * a write has nowhere to go (offline edits are #470). A guest's library lives
 * in this browser and stays writable.
 */

export const OFFLINE_WRITE_REASON = "You're offline. Saving needs a connection.";

function browserOnline(): boolean {
	return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function writesBlocked(user: User | null, online: boolean = browserOnline()): boolean {
	return user !== null && !online;
}

/**
 * The last line behind every disabled control: a write a signed-in player
 * starts offline is refused, with the reason, before anything changes on
 * screen — an optimistic change would show as saved and be kept in the copy.
 */
export function refuseOfflineWrite(user: User | null, online: boolean = browserOnline()): boolean {
	if (!writesBlocked(user, online)) return false;
	toast(OFFLINE_WRITE_REASON, { id: "offline-write" });
	return true;
}
