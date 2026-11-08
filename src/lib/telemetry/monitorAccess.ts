/**
 * Who may open the monitor (#458): the accounts listed in `MONITOR_USER_IDS`,
 * comma-separated Supabase user ids. Unset or empty, nobody may — the page then
 * answers as if it did not exist.
 */
export function monitorViewers(setting: string | undefined): ReadonlySet<string> {
	return new Set((setting ?? "").split(",").map((id) => id.trim()).filter(Boolean));
}

export function canViewMonitor(userId: string | null | undefined, setting: string | undefined = process.env.MONITOR_USER_IDS): boolean {
	return Boolean(userId) && monitorViewers(setting).has(userId as string);
}
