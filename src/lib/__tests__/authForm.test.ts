import { describe, it, expect, beforeEach } from "vitest";
import {
	isPlausibleEmail,
	parseAuthMode,
	readLastMethod,
	readRememberedEmail,
	rememberEmail,
	rememberMethod,
	REMEMBERED_EMAIL_KEY,
} from "../authForm";

describe("parseAuthMode", () => {
	it("opens sign-up only for the exact value", () => {
		expect(parseAuthMode("signup")).toBe("signup");
		expect(parseAuthMode("signin")).toBe("signin");
		expect(parseAuthMode("SIGNUP")).toBe("signin");
		expect(parseAuthMode(null)).toBe("signin");
		expect(parseAuthMode(undefined)).toBe("signin");
	});
});

describe("isPlausibleEmail", () => {
	it("accepts ordinary addresses", () => {
		expect(isPlausibleEmail("you@example.com")).toBe(true);
		expect(isPlausibleEmail("first.last+tag@sub.example.co.uk")).toBe(true);
		expect(isPlausibleEmail("  padded@example.com  ")).toBe(true);
	});

	it("rejects the typos worth catching before a round trip", () => {
		expect(isPlausibleEmail("")).toBe(false);
		expect(isPlausibleEmail("you")).toBe(false);
		expect(isPlausibleEmail("you@")).toBe(false);
		expect(isPlausibleEmail("@example.com")).toBe(false);
		expect(isPlausibleEmail("you@example")).toBe(false);
		expect(isPlausibleEmail("you@example.")).toBe(false);
		expect(isPlausibleEmail("you@@example.com")).toBe(false);
		expect(isPlausibleEmail("you @example.com")).toBe(false);
	});
});

describe("remembered email and method", () => {
	beforeEach(() => localStorage.clear());

	it("is empty until something signs in", () => {
		expect(readRememberedEmail()).toBeNull();
		expect(readLastMethod()).toBeNull();
	});

	it("round-trips, trimming the email", () => {
		rememberEmail("  you@example.com ");
		rememberMethod("email");
		expect(readRememberedEmail()).toBe("you@example.com");
		expect(readLastMethod()).toBe("email");
	});

	it("ignores a stored value it does not understand", () => {
		localStorage.setItem(REMEMBERED_EMAIL_KEY, "");
		localStorage.setItem("gp-auth-method", "carrier-pigeon");
		expect(readRememberedEmail()).toBeNull();
		expect(readLastMethod()).toBeNull();
	});
});
