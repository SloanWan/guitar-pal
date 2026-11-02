import { describe, expect, it } from "vitest";
import {
	MAX_REFERENCE_LABEL,
	MAX_REFERENCES,
	readReferences,
	readReferenceUrl,
	referenceHost,
	referenceShortUrl,
	referenceSite,
	referenceTitle,
} from "@/lib/tabReferences";

describe("readReferenceUrl", () => {
	it("keeps a web link as written", () => {
		expect(readReferenceUrl("  https://www.youtube.com/watch?v=abc&t=42s ")).toEqual({
			url: "https://www.youtube.com/watch?v=abc&t=42s",
		});
		expect(readReferenceUrl("http://example.com/tab")).toEqual({ url: "http://example.com/tab" });
	});

	it("gives a bare link https", () => {
		expect(readReferenceUrl("youtu.be/abc")).toEqual({ url: "https://youtu.be/abc" });
		expect(readReferenceUrl("example.com:8080/a")).toEqual({ url: "https://example.com:8080/a" });
	});

	it("refuses anything that is not a web link", () => {
		for (const input of [
			"javascript:alert(1)",
			"JavaScript:alert(1)",
			"data:text/html,<b>x</b>",
			"mailto:a@b.com",
			"ftp://example.com/a",
			"file:///etc/passwd",
		]) {
			expect(readReferenceUrl(input)).toHaveProperty("error");
		}
	});

	it("refuses what is not a link at all", () => {
		expect(readReferenceUrl("")).toHaveProperty("error");
		expect(readReferenceUrl("   ")).toHaveProperty("error");
		expect(readReferenceUrl("birds of a feather")).toHaveProperty("error");
		expect(readReferenceUrl("localhost:3000")).toHaveProperty("error");
		expect(readReferenceUrl("https://user:pw@example.com")).toHaveProperty("error");
		expect(readReferenceUrl(`https://example.com/${"a".repeat(2000)}`)).toHaveProperty("error");
	});
});

describe("referenceSite", () => {
	it("tells the sites apart by host, short links and subdomains included", () => {
		expect(referenceSite("https://www.youtube.com/watch?v=abc")).toBe("youtube");
		expect(referenceSite("https://m.youtube.com/watch?v=abc")).toBe("youtube");
		expect(referenceSite("https://youtu.be/abc")).toBe("youtube");
		expect(referenceSite("https://www.bilibili.com/video/BV1xx411c7mD")).toBe("bilibili");
		expect(referenceSite("https://b23.tv/abc")).toBe("bilibili");
		expect(referenceSite("https://open.spotify.com/track/abc")).toBe("spotify");
		expect(referenceSite("https://spotify.link/abc")).toBe("spotify");
		expect(referenceSite("https://music.163.com/#/song?id=123")).toBe("netease");
		expect(referenceSite("https://y.music.163.com/m/song?id=123")).toBe("netease");
		expect(referenceSite("https://163cn.tv/abc")).toBe("netease");
	});

	it("does not take a look-alike host for the site", () => {
		expect(referenceSite("https://notyoutube.com/watch")).toBe("web");
		expect(referenceSite("https://youtube.com.evil.example/watch")).toBe("web");
		expect(referenceSite("https://www.163.com/news")).toBe("web");
		expect(referenceSite("https://www.songsterr.com/a/wsa/x")).toBe("web");
	});
});

describe("referenceTitle", () => {
	it("is the player's name, else the site's, else the host without www", () => {
		expect(referenceTitle({ id: "a", url: "https://www.songsterr.com/x", label: "Live take" })).toBe("Live take");
		expect(referenceTitle({ id: "a", url: "https://youtu.be/abc" })).toBe("YouTube");
		expect(referenceTitle({ id: "a", url: "https://www.songsterr.com/x" })).toBe("songsterr.com");
		expect(referenceHost("https://open.spotify.com/track/1")).toBe("open.spotify.com");
	});
});

describe("referenceShortUrl", () => {
	it("leads with the host and drops the scheme", () => {
		expect(referenceShortUrl("https://www.youtube.com/watch?v=abc")).toBe("youtube.com/watch?v=abc");
		expect(referenceShortUrl("https://music.163.com/#/song?id=1")).toBe("music.163.com#/song?id=1");
		expect(referenceShortUrl("https://example.com/")).toBe("example.com");
	});
});

describe("readReferences", () => {
	it("reads back well-formed links and drops the rest", () => {
		expect(
			readReferences([
				{ id: "a", url: "https://youtu.be/abc", label: "  Official video " },
				{ id: "b", url: "javascript:alert(1)" },
				{ id: "c", url: "youtu.be/abc" },
				{ id: "a", url: "https://example.com/" },
				{ id: "", url: "https://example.com/" },
				{ url: "https://example.com/" },
				"https://example.com/",
				null,
				{ id: "d", url: "https://example.com/", label: 7 },
				{ id: "e", url: "https://example.com/", label: "   " },
			]),
		).toEqual([
			{ id: "a", url: "https://youtu.be/abc", label: "Official video" },
			{ id: "d", url: "https://example.com/" },
			{ id: "e", url: "https://example.com/" },
		]);
	});

	it("caps the list and each name", () => {
		const many = Array.from({ length: MAX_REFERENCES + 3 }, (_, i) => ({
			id: `r${i}`,
			url: `https://example.com/${i}`,
			label: "x".repeat(MAX_REFERENCE_LABEL + 20),
		}));
		const read = readReferences(many);
		expect(read).toHaveLength(MAX_REFERENCES);
		expect(read?.[0].label).toHaveLength(MAX_REFERENCE_LABEL);
	});

	it("is absent when there is nothing to keep", () => {
		expect(readReferences(undefined)).toBeUndefined();
		expect(readReferences(null)).toBeUndefined();
		expect(readReferences([])).toBeUndefined();
		expect(readReferences({ id: "a", url: "https://example.com/" })).toBeUndefined();
		expect(readReferences([{ id: "b", url: "data:text/html,x" }])).toBeUndefined();
	});
});
