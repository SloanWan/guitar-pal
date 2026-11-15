/**
 * Which install steps a visitor sees first on `/docs/install` (#525), told
 * from the request's User-Agent on the server, so the page renders with the
 * right platform chosen and nothing flips after hydration.
 *
 * iPadOS Safari asks for desktop sites and says "Macintosh", so an iPad lands
 * on Computer; the picker is one tap away.
 */

export type InstallPlatform = "ios" | "android" | "desktop";

export const INSTALL_PLATFORMS: readonly InstallPlatform[] = ["ios", "android", "desktop"];

export function isInstallPlatform(value: unknown): value is InstallPlatform {
	return value === "ios" || value === "android" || value === "desktop";
}

export function platformFromUserAgent(userAgent: string | null | undefined): InstallPlatform {
	if (!userAgent) return "ios";
	if (/android/i.test(userAgent)) return "android";
	if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
	if (/windows|macintosh|mac os x|cros|linux/i.test(userAgent)) return "desktop";
	return "ios";
}
