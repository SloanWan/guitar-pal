import { describe, expect, it } from "vitest";
import { INSTALL_GUIDE_COPY } from "@/components/docs/installGuideCopy";
import { INSTALL_PLATFORMS } from "@/lib/pwa/installPlatform";

const { en, zh } = INSTALL_GUIDE_COPY;

describe("the install guide's two languages", () => {
	it("give every platform the same steps and notes", () => {
		for (const platform of INSTALL_PLATFORMS) {
			expect(zh.platforms[platform].steps.length, platform).toBe(en.platforms[platform].steps.length);
			expect(Boolean(zh.platforms[platform].note), platform).toBe(Boolean(en.platforms[platform].note));
		}
	});

	it("list the same things that work, and do not, without a connection", () => {
		expect(zh.works.length).toBe(en.works.length);
		expect(zh.doesNot.length).toBe(en.doesNot.length);
	});

	it("keep backticked labels paired", () => {
		const unpaired = (text: string) => (text.match(/`/g) ?? []).length % 2 !== 0;
		for (const copy of [en, zh]) {
			for (const platform of INSTALL_PLATFORMS) {
				const { steps, note, remove } = copy.platforms[platform];
				for (const text of [...steps, note ?? "", remove]) expect(unpaired(text), text).toBe(false);
			}
		}
	});
});
