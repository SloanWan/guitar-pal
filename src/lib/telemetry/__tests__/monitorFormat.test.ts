import { describe, expect, it } from "vitest";
import { formatBucket, formatRate, formatVital, formatWhen } from "../monitorFormat";

describe("monitor formats", () => {
	it("writes vitals in the unit they are read in", () => {
		expect(formatVital("LCP", 640)).toBe("640 ms");
		expect(formatVital("LCP", 12093.4)).toBe("12.1 s");
		expect(formatVital("CLS", 0.0832)).toBe("0.08");
		expect(formatVital("INP", null)).toBe("—");
	});

	it("writes an error rate as a percentage", () => {
		expect(formatRate(0.0625)).toBe("6.3%");
		expect(formatRate(0.5)).toBe("50%");
		expect(formatRate(null)).toBe("—");
	});

	it("writes times and buckets on the dashboard's clock", () => {
		expect(formatWhen("2026-11-08T10:49:00Z", "Asia/Shanghai")).toBe("11-08 18:49");
		expect(formatBucket("2026-11-08")).toBe("11-08");
		expect(formatBucket("2026-11-08 14")).toBe("14:00");
	});
});
