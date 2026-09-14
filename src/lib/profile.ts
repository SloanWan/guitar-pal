/**
 * Who the signed-in user is, as the UI shows them: a display name, an initial
 * to sit on the avatar chip, and the chip's colour.
 *
 * Both editable fields live in `auth.users.user_metadata` (keys below), not in
 * a profiles table — nothing in the app displays another user's profile, so
 * a table would be reuse-free. That metadata rides in the JWT and is readable
 * and writable by the user, which is fine for a nickname and a colour and
 * disqualifies it for anything secret.
 *
 * The colour has two sources: an explicit `avatar_color` the user picked, or a
 * hash of the user id into AVATAR_COLORS. The hash makes every existing
 * account come up with a stable colour with no backfill; the metadata key only
 * exists once the user overrides it.
 */

/**
 * Palette slot names — a Morandi set; the fills and their inks live in
 * globals.css as `--avatar-<slot>` / `--avatar-<slot>-ink`.
 */
export const AVATAR_COLORS = [
	"rose",
	"clay",
	"sand",
	"olive",
	"sage",
	"mist",
	"mauve",
	"stone",
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

/**
 * What can sit on the chip instead of the initial. Ids only — the drawings are
 * looked up in UserAvatar, which keeps lucide out of this pure module.
 */
export const AVATAR_ICONS = [
	"guitar",
	"music",
	"mic",
	"headphones",
	"drum",
	"piano",
	"audio-lines",
	"disc",
	"star",
	"zap",
	"flame",
	"sparkles",
] as const;

export type AvatarIcon = (typeof AVATAR_ICONS)[number];

/** `user_metadata` keys written by the profile editor. */
export const NICKNAME_KEY = "nickname";
export const AVATAR_COLOR_KEY = "avatar_color";
/** An AVATAR_ICONS id, or absent/null for the initial. */
export const AVATAR_ICON_KEY = "avatar_icon";

/**
 * Name keys an OAuth provider fills in at sign-up (Google writes `full_name`
 * and `name`). Read after the nickname, so a provider name is the default a
 * user starts with and a nickname is how they change it.
 */
const PROVIDER_NAME_KEYS = ["full_name", "name", "user_name"] as const;

export const NICKNAME_MAX_LENGTH = 24;

/** Shown when the account has neither a nickname nor an email to derive one from. */
export const FALLBACK_DISPLAY_NAME = "Guitarist";

/**
 * The slice of a Supabase `User` the profile reads. Typed structurally so the
 * server and the tests can hand in plain objects.
 */
export interface ProfileSource {
	id: string;
	email?: string | null;
	user_metadata?: Record<string, unknown> | null;
}

export interface Profile {
	displayName: string;
	/** Null only for accounts without an email (not something we create today). */
	email: string | null;
	initial: string;
	color: AvatarColor;
	/** When set, the chip draws this instead of the initial. */
	icon: AvatarIcon | null;
}

export function isAvatarColor(value: unknown): value is AvatarColor {
	return (
		typeof value === "string" && (AVATAR_COLORS as readonly string[]).includes(value)
	);
}

export function isAvatarIcon(value: unknown): value is AvatarIcon {
	return typeof value === "string" && (AVATAR_ICONS as readonly string[]).includes(value);
}

/** The chosen icon if it names one we ship; anything else means the initial. */
export function avatarIconFor(user: ProfileSource): AvatarIcon | null {
	const chosen = user.user_metadata?.[AVATAR_ICON_KEY];
	return isAvatarIcon(chosen) ? chosen : null;
}

function nonBlank(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/** A nickname is a non-empty trimmed string; anything else reads as unset. */
export function nicknameOf(user: ProfileSource): string | null {
	return nonBlank(user.user_metadata?.[NICKNAME_KEY]);
}

/** The name an OAuth provider supplied, if any. */
export function providerNameOf(user: ProfileSource): string | null {
	for (const key of PROVIDER_NAME_KEYS) {
		const name = nonBlank(user.user_metadata?.[key]);
		if (name) return name;
	}
	return null;
}

/** Nickname, then a provider name, then the local part of the email, then the fallback. */
export function displayNameOf(user: ProfileSource): string {
	return (
		nicknameOf(user) ??
		providerNameOf(user) ??
		nonBlank(user.email?.split("@")[0]) ??
		FALLBACK_DISPLAY_NAME
	);
}

/**
 * First *code point* of the name, upper-cased — `Array.from` rather than
 * `name[0]` so a CJK or emoji nickname isn't sliced through a surrogate pair.
 */
export function initialOf(name: string): string {
	const first = Array.from(name.trim())[0];
	return first ? first.toLocaleUpperCase() : "?";
}

/** FNV-1a over the UTF-16 code units — small, stable, spreads UUIDs well enough. */
function hashString(value: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** The explicit `avatar_color` if it names a palette slot, else the hashed default. */
export function avatarColorFor(user: ProfileSource): AvatarColor {
	const chosen = user.user_metadata?.[AVATAR_COLOR_KEY];
	if (isAvatarColor(chosen)) return chosen;
	return AVATAR_COLORS[hashString(user.id) % AVATAR_COLORS.length];
}

export function profileOf(user: ProfileSource): Profile {
	const displayName = displayNameOf(user);
	return {
		displayName,
		email: user.email ?? null,
		initial: initialOf(displayName),
		color: avatarColorFor(user),
		icon: avatarIconFor(user),
	};
}
