/**
 * Which language the assistant answers in.
 *
 * Decided per message, from the message: a sentence with Chinese characters
 * in it is answered in Chinese, anything else in English. Chord letters and
 * notation carry no language, and fall to the interface's. There is no
 * setting — the reply follows the player, the way a person's would.
 */

export type Lang = "en" | "zh";

const CJK = /[㐀-䶿一-鿿]/;

export function detectLang(text: string, fallback: Lang = "en"): Lang {
	return CJK.test(text) ? "zh" : fallback;
}

/** The interface's language, for the moments before the player has said anything. */
export function uiLang(): Lang {
	if (typeof navigator === "undefined") return "en";
	return /^zh\b/i.test(navigator.language) ? "zh" : "en";
}

/** The one of two strings a language wants. */
export function pick(lang: Lang, en: string, zh: string): string {
	return lang === "zh" ? zh : en;
}
