import { describe, it, expect } from "vitest";
import {
	MIN_ACCEPTED_LEVEL,
	PASSWORD_MIN_LENGTH,
	meetsLevel,
	passwordStrength,
} from "@/lib/passwordStrength";

describe("passwordStrength", () => {
	it("rejects anything under the minimum length outright", () => {
		const r = passwordStrength("Ab1!xyz");
		expect(r.level).toBe("weak");
		expect(r.acceptable).toBe(false);
		expect(r.hint).toContain(String(PASSWORD_MIN_LENGTH));
	});

	it("rejects the classic weak passwords regardless of case", () => {
		for (const p of ["password", "PASSWORD", "12345678", "qwertyuiop", "iloveyou"]) {
			expect(passwordStrength(p).score, p).toBe(0);
		}
	});

	it("scores a single-class short password as weak", () => {
		expect(passwordStrength("abcdefgh").level).toBe("weak"); // run + one class
		expect(passwordStrength("zzzzzzzz").level).toBe("weak"); // repeat + one class
		expect(passwordStrength("bluesguy").level).toBe("weak"); // one class
	});

	it("accepts two classes at eight characters as fair", () => {
		const r = passwordStrength("blues8bar");
		expect(r.level).toBe("fair");
		expect(r.acceptable).toBe(true);
	});

	it("rewards length as much as character mix", () => {
		expect(passwordStrength("correcthorsebatterystaple").level).toBe("good");
		expect(passwordStrength("Tr0ub4dor&3").level).toBe("good");
		expect(passwordStrength("Open-D-tuning-1975!").level).toBe("strong");
	});

	it("penalises keyboard and counting runs in either direction", () => {
		expect(passwordStrength("Qwer1234!").score).toBeLessThan(passwordStrength("Qmxr1739!").score);
		expect(passwordStrength("Dcba9876!").score).toBeLessThan(passwordStrength("Dxka9276!").score);
	});

	it("penalises the email handle", () => {
		const bare = passwordStrength("sloan-plays-2024");
		const withEmail = passwordStrength("sloan-plays-2024", "sloan@example.com");
		expect(withEmail.score).toBe(bare.score - 1);
		expect(withEmail.hint).toMatch(/email/i);
	});

	it("ignores an email handle too short to mean anything", () => {
		expect(passwordStrength("ab-major-7th", "ab@example.com").hint).not.toMatch(/email/i);
	});

	it("keeps the score inside 0–4", () => {
		expect(passwordStrength("aaaa1234").score).toBeGreaterThanOrEqual(0);
		expect(passwordStrength("X9!qL2#vB7@mN4$pW6^z").score).toBe(4);
	});

	it("has no hint once the password is strong", () => {
		expect(passwordStrength("X9!qL2#vB7@mN4$pW6^z").hint).toBeNull();
	});

	it("offers a next step for a merely fair password", () => {
		expect(passwordStrength("blues8bar").hint).toMatch(/longer/i);
	});
});

describe("meetsLevel", () => {
	it("orders the levels", () => {
		expect(meetsLevel("weak", MIN_ACCEPTED_LEVEL)).toBe(false);
		expect(meetsLevel("fair", MIN_ACCEPTED_LEVEL)).toBe(true);
		expect(meetsLevel("strong", "good")).toBe(true);
		expect(meetsLevel("good", "strong")).toBe(false);
	});
});
