import { describe, expect, it } from "vitest";
import { isInstallPlatform, platformFromUserAgent } from "@/lib/pwa/installPlatform";

const UA = {
	iphone:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
	iphoneChrome:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
	android:
		"Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
	ipadDesktop:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
	windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0",
	linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
};

describe("platformFromUserAgent", () => {
	it("tells phones apart, whatever the browser", () => {
		expect(platformFromUserAgent(UA.iphone)).toBe("ios");
		expect(platformFromUserAgent(UA.iphoneChrome)).toBe("ios");
		// Android's UA also says Linux: Android wins.
		expect(platformFromUserAgent(UA.android)).toBe("android");
	});

	it("puts computers, and an iPad asking for the desktop site, on Computer", () => {
		expect(platformFromUserAgent(UA.windows)).toBe("desktop");
		expect(platformFromUserAgent(UA.linux)).toBe("desktop");
		expect(platformFromUserAgent(UA.ipadDesktop)).toBe("desktop");
	});

	it("falls back to iPhone when there is nothing to go on", () => {
		expect(platformFromUserAgent(null)).toBe("ios");
		expect(platformFromUserAgent("")).toBe("ios");
		expect(platformFromUserAgent("curl/8.7.1")).toBe("ios");
	});

	it("checks a platform name", () => {
		expect(isInstallPlatform("android")).toBe(true);
		expect(isInstallPlatform("windows")).toBe(false);
	});
});
