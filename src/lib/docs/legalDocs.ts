import type { DocLang } from "@/lib/docs/docLang";

/**
 * The site's privacy policy, terms and support page (#492): what the MCP
 * directories link to, and what the landing footer lists. Each is
 * `docs/legal/<name>.md` and `<name>.zh.md`.
 */

export type LegalDoc = "privacy" | "terms" | "support";

export const LEGAL_DOC_NAMES: readonly LegalDoc[] = ["privacy", "terms", "support"];

/** The contact on every one of them: help, data requests and security reports. */
export const CONTACT_EMAIL = "nysuswan@gmail.com";

export const LEGAL_DOCS: Record<LegalDoc, Record<DocLang, { title: string; description: string; label: string }>> = {
	privacy: {
		en: { title: "Privacy policy", label: "Privacy", description: "What Guitar Pal keeps about you, why, where, and how to have it removed." },
		zh: { title: "隐私政策", label: "隐私", description: "Guitar Pal 保存你的哪些信息、为什么保存、存在哪里，以及怎样删除。" },
	},
	terms: {
		en: { title: "Terms of use", label: "Terms", description: "The terms for using Guitar Pal and its MCP connector." },
		zh: { title: "使用条款", label: "条款", description: "使用 Guitar Pal 及其 MCP 连接器的条款。" },
	},
	support: {
		en: { title: "Support", label: "Support", description: "Get help with Guitar Pal, report a bug or a security problem." },
		zh: { title: "支持", label: "支持", description: "获取 Guitar Pal 的帮助，反馈问题或报告安全漏洞。" },
	},
};

/** The document's file under `docs/`. */
export function legalDocFile(name: LegalDoc, lang: DocLang): string {
	return `legal/${name}${lang === "zh" ? ".zh" : ""}.md`;
}
