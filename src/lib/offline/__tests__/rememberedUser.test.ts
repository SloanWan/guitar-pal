import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { forgetRememberedUser, REMEMBERED_USER_KEY, rememberedUser, rememberUser } from "../rememberedUser";

const user = { id: "u1", email: "player@example.com" } as User;

describe("rememberedUser", () => {
	beforeEach(() => localStorage.clear());

	it("is the user last remembered, until forgotten", () => {
		expect(rememberedUser()).toBeNull();
		rememberUser(user);
		expect(rememberedUser()).toEqual(user);
		forgetRememberedUser();
		expect(rememberedUser()).toBeNull();
	});

	it("is null for anything stored that is not a user", () => {
		localStorage.setItem(REMEMBERED_USER_KEY, "{not json");
		expect(rememberedUser()).toBeNull();
		localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify({ email: "no id" }));
		expect(rememberedUser()).toBeNull();
		localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify({ id: 42 }));
		expect(rememberedUser()).toBeNull();
	});
});
