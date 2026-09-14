import { describe, it, expect } from "vitest";
import {
	AVATAR_COLORS,
	FALLBACK_DISPLAY_NAME,
	avatarColorFor,
	avatarIconFor,
	displayNameOf,
	initialOf,
	isAvatarColor,
	nicknameOf,
	profileOf,
} from "@/lib/profile";
import type { ProfileSource } from "@/lib/profile";

const ID = "2f1c9b4e-7d3a-4c58-9e21-0b6f5a8d3c47";

function user(overrides: Partial<ProfileSource> = {}): ProfileSource {
	return { id: ID, email: "sloan@example.com", user_metadata: {}, ...overrides };
}

describe("nicknameOf", () => {
	it("reads a trimmed nickname from user_metadata", () => {
		expect(nicknameOf(user({ user_metadata: { nickname: "  Sloan  " } }))).toBe("Sloan");
	});

	it("treats blank, missing and non-string nicknames as unset", () => {
		expect(nicknameOf(user({ user_metadata: { nickname: "   " } }))).toBeNull();
		expect(nicknameOf(user({ user_metadata: {} }))).toBeNull();
		expect(nicknameOf(user({ user_metadata: null }))).toBeNull();
		expect(nicknameOf(user({ user_metadata: { nickname: 42 } }))).toBeNull();
	});
});

describe("displayNameOf", () => {
	it("prefers the nickname", () => {
		expect(displayNameOf(user({ user_metadata: { nickname: "Sloan" } }))).toBe("Sloan");
	});

	it("uses a provider-supplied name before the email", () => {
		expect(displayNameOf(user({ user_metadata: { full_name: "Sloan Wan" } }))).toBe(
			"Sloan Wan",
		);
		expect(displayNameOf(user({ user_metadata: { name: "sloan" } }))).toBe("sloan");
	});

	it("lets a nickname override a provider name", () => {
		expect(
			displayNameOf(user({ user_metadata: { full_name: "Sloan Wan", nickname: "S" } })),
		).toBe("S");
	});

	it("falls back to the local part of the email", () => {
		expect(displayNameOf(user({ email: "sloan.w@example.com" }))).toBe("sloan.w");
		expect(displayNameOf(user({ user_metadata: { full_name: "  " } }))).toBe("sloan");
	});

	it("falls back to the constant when there is neither", () => {
		expect(displayNameOf(user({ email: null }))).toBe(FALLBACK_DISPLAY_NAME);
		expect(displayNameOf(user({ email: "@example.com" }))).toBe(FALLBACK_DISPLAY_NAME);
	});
});

describe("initialOf", () => {
	it("upper-cases the first character", () => {
		expect(initialOf("sloan")).toBe("S");
	});

	it("ignores leading whitespace", () => {
		expect(initialOf("  bo")).toBe("B");
	});

	it("takes a whole code point, not a surrogate half", () => {
		expect(initialOf("吉他手")).toBe("吉");
		expect(initialOf("🎸 player")).toBe("🎸");
	});

	it("returns a placeholder for an empty name", () => {
		expect(initialOf("")).toBe("?");
		expect(initialOf("   ")).toBe("?");
	});
});

describe("avatarColorFor", () => {
	it("is stable for the same id and always a palette slot", () => {
		const a = avatarColorFor(user());
		expect(avatarColorFor(user())).toBe(a);
		expect(AVATAR_COLORS).toContain(a);
	});

	it("spreads different ids across more than one slot", () => {
		const seen = new Set(
			Array.from({ length: 64 }, (_, i) => avatarColorFor(user({ id: `user-${i}` }))),
		);
		expect(seen.size).toBeGreaterThan(1);
	});

	it("honours an explicit palette choice over the hash", () => {
		const hashed = avatarColorFor(user());
		const chosen = AVATAR_COLORS.find((c) => c !== hashed)!;
		expect(avatarColorFor(user({ user_metadata: { avatar_color: chosen } }))).toBe(chosen);
	});

	it("ignores a choice that is not in the palette", () => {
		const hashed = avatarColorFor(user());
		expect(avatarColorFor(user({ user_metadata: { avatar_color: "#ff0000" } }))).toBe(hashed);
		expect(avatarColorFor(user({ user_metadata: { avatar_color: 3 } }))).toBe(hashed);
	});
});

describe("avatarIconFor", () => {
	it("returns a shipped icon id, else null", () => {
		expect(avatarIconFor(user({ user_metadata: { avatar_icon: "guitar" } }))).toBe("guitar");
		expect(avatarIconFor(user({ user_metadata: { avatar_icon: "unicorn" } }))).toBeNull();
		expect(avatarIconFor(user({ user_metadata: { avatar_icon: null } }))).toBeNull();
		expect(avatarIconFor(user())).toBeNull();
	});
});

describe("isAvatarColor", () => {
	it("accepts palette names only", () => {
		expect(isAvatarColor("sage")).toBe(true);
		expect(isAvatarColor("SAGE")).toBe(false);
		expect(isAvatarColor(undefined)).toBe(false);
	});
});

describe("profileOf", () => {
	it("assembles the view model from the pieces", () => {
		expect(
			profileOf(user({ user_metadata: { nickname: "sloan", avatar_color: "mauve" } })),
		).toEqual({
			displayName: "sloan",
			email: "sloan@example.com",
			initial: "S",
			color: "mauve",
			icon: null,
		});
	});

	it("derives the initial from the email when there is no nickname", () => {
		const p = profileOf(user({ email: "kai@example.com" }));
		expect(p.displayName).toBe("kai");
		expect(p.initial).toBe("K");
	});

	it("reports a null email rather than an empty string", () => {
		expect(profileOf(user({ email: undefined })).email).toBeNull();
	});
});
