import { describe, expect, it } from "vitest";
import { LAUNCH_SCREENS, launchImageFor, launchImages } from "../launchScreens";

describe("launchImages (#490)", () => {
	const images = launchImages();

	it("gives every screen a portrait and a landscape image, each its own file", () => {
		expect(images).toHaveLength(LAUNCH_SCREENS.length * 2);
		expect(new Set(images.map((i) => i.url)).size).toBe(images.length);
		expect(new Set(images.map((i) => i.media)).size).toBe(images.length);
	});

	it("sizes an image in device pixels, turned for landscape, and names it by its size", () => {
		const [portrait, landscape] = launchImages([{ width: 430, height: 932, ratio: 3 }]);
		expect(portrait).toMatchObject({ width: 1290, height: 2796, url: "/launch/1290x2796.png" });
		expect(landscape).toMatchObject({ width: 2796, height: 1290, url: "/launch/2796x1290.png" });
	});

	it("picks an image by the portrait device size, the ratio and the orientation", () => {
		const [portrait, landscape] = launchImages([{ width: 834, height: 1194, ratio: 2 }]);
		expect(portrait.media).toBe(
			"screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
		);
		expect(landscape.media).toContain("(device-width: 834px) and (device-height: 1194px)");
		expect(landscape.media).toContain("(orientation: landscape)");
	});

	it("finds an image by its file name, and nothing else", () => {
		expect(launchImageFor("1290x2796.png")?.width).toBe(1290);
		expect(launchImageFor("100x100.png")).toBeNull();
		expect(launchImageFor("../icon-512.png")).toBeNull();
	});
});
