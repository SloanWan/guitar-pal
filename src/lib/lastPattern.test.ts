import { describe, it, expect } from "vitest";
import {
	resolvePatternMeta,
	resolvePatternMetas,
	type NamedPattern,
} from "./lastPattern";

const PRESETS: NamedPattern[] = [
	{ id: "preset-a", name: "Preset A" },
	{ id: "preset-b", name: "Preset B" },
];

const CUSTOMS: NamedPattern[] = [
	{ id: "custom-x", name: "Custom X" },
	{ id: "custom-y", name: "Custom Y" },
];

describe("resolvePatternMeta", () => {
	it("resolves a preset id and tags it as preset", () => {
		expect(resolvePatternMeta("preset-b", PRESETS, CUSTOMS)).toEqual({
			id: "preset-b",
			name: "Preset B",
			source: "preset",
		});
	});

	it("resolves a custom id and tags it as custom", () => {
		expect(resolvePatternMeta("custom-x", PRESETS, CUSTOMS)).toEqual({
			id: "custom-x",
			name: "Custom X",
			source: "custom",
		});
	});

	it("returns null for an id that no longer resolves (e.g. deleted pattern)", () => {
		expect(resolvePatternMeta("gone", PRESETS, CUSTOMS)).toBeNull();
	});

	it("prefers a preset over a custom pattern with the same id", () => {
		const shadowed = resolvePatternMeta("dup", [{ id: "dup", name: "The Preset" }], [
			{ id: "dup", name: "The Custom" },
		]);
		expect(shadowed).toEqual({ id: "dup", name: "The Preset", source: "preset" });
	});
});

describe("resolvePatternMetas", () => {
	it("preserves input order and drops unresolved ids", () => {
		const result = resolvePatternMetas(
			["custom-y", "gone", "preset-a"],
			PRESETS,
			CUSTOMS,
		);
		expect(result).toEqual([
			{ id: "custom-y", name: "Custom Y", source: "custom" },
			{ id: "preset-a", name: "Preset A", source: "preset" },
		]);
	});

	it("returns an empty array when nothing resolves", () => {
		expect(resolvePatternMetas(["nope", "nada"], PRESETS, CUSTOMS)).toEqual([]);
	});
});
