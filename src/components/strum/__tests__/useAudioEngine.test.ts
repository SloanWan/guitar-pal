import { describe, it, expect } from "vitest";
import { _resolveStrumBuffer } from "@/components/strum/useAudioEngine";

function makeFakeBuffer(): AudioBuffer {
	return {} as AudioBuffer;
}

describe("_resolveStrumBuffer — step-to-buffer resolution and pending-sample fallback", () => {
	const downBuf = makeFakeBuffer();
	const upBuf = makeFakeBuffer();
	const mutedBuf = makeFakeBuffer();
	const fullBuffers = { down: downBuf, up: upBuf, muted: mutedBuf };

	it("D maps to the down AudioBuffer", () => {
		expect(_resolveStrumBuffer("D", fullBuffers)).toBe(downBuf);
	});

	it("D3 maps to the down AudioBuffer", () => {
		expect(_resolveStrumBuffer("D3", fullBuffers)).toBe(downBuf);
	});

	it("U maps to the up AudioBuffer", () => {
		expect(_resolveStrumBuffer("U", fullBuffers)).toBe(upBuf);
	});

	it("U3 maps to the up AudioBuffer", () => {
		expect(_resolveStrumBuffer("U3", fullBuffers)).toBe(upBuf);
	});

	it("X maps to the muted AudioBuffer", () => {
		expect(_resolveStrumBuffer("X", fullBuffers)).toBe(mutedBuf);
	});

	it("DG returns null (ghost strum — silent)", () => {
		expect(_resolveStrumBuffer("DG", fullBuffers)).toBeNull();
	});

	it("UG returns null (ghost strum — silent)", () => {
		expect(_resolveStrumBuffer("UG", fullBuffers)).toBeNull();
	});

	it('empty string returns null (rest — silent)', () => {
		expect(_resolveStrumBuffer("", fullBuffers)).toBeNull();
	});

	it("returns null for any active step when no buffers have loaded yet (pending-sample fallback)", () => {
		expect(_resolveStrumBuffer("D", {})).toBeNull();
		expect(_resolveStrumBuffer("U", {})).toBeNull();
		expect(_resolveStrumBuffer("X", {})).toBeNull();
	});

	it("returns null for a step whose buffer has not loaded even when other types are ready", () => {
		expect(_resolveStrumBuffer("U", { down: downBuf })).toBeNull();
		expect(_resolveStrumBuffer("X", { down: downBuf, up: upBuf })).toBeNull();
	});
});
