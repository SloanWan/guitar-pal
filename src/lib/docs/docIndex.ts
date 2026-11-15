import type { DocLang } from "@/lib/docs/docLang";

/**
 * The guides `/docs` lists (#500), in the order it lists them. Each is a page
 * under `src/app/(main)/docs/`; a test fails when one is missing here.
 */

export type DocSlug = "install" | "mcp" | "assistant-grammar";

export interface DocGuide {
	/** The page's folder under `docs/`, and its path. */
	slug: DocSlug;
	copy: Record<DocLang, { title: string; line: string }>;
}

export const DOC_GUIDES: readonly DocGuide[] = [
	{
		slug: "install",
		copy: {
			en: { title: "Add Guitar Pal to your home screen", line: "Open it like an app, and keep playing with no signal." },
			zh: { title: "把 Guitar Pal 添加到主屏幕", line: "像 App 一样打开，没有网络也能接着练。" },
		},
	},
	{
		slug: "mcp",
		copy: {
			en: { title: "Connect Guitar Pal to your AI", line: "Ask Claude or ChatGPT for a pattern or a tab, and get back a link that plays it." },
			zh: { title: "把 Guitar Pal 接入你的 AI", line: "让 Claude 或 ChatGPT 写节奏型或六线谱，拿回一个能直接播放的链接。" },
		},
	},
	{
		slug: "assistant-grammar",
		copy: {
			en: { title: "What the assistant reads", line: "The sentences the Strum and Tab assistants understand, with examples." },
			zh: { title: "助手能读懂什么", line: "Strum 和 Tab 助手能读懂的句子，附例句。" },
		},
	},
];

export function docHref(slug: DocSlug, lang?: DocLang): string {
	return lang ? `/docs/${slug}?lang=${lang}` : `/docs/${slug}`;
}

/** The index page's own words. */
export const DOC_INDEX_COPY: Record<
	DocLang,
	{ title: string; description: string; heading: string; lead: string; devLead: string; devLink: string; back: string }
> = {
	en: {
		title: "Docs | Guitar Pal",
		description: "Guitar Pal's guides: installing it, connecting it to your AI, and what the assistant reads.",
		heading: "Docs",
		lead: "How to get more out of Guitar Pal.",
		devLead: "For developers: the MCP server's full reference is",
		devLink: "docs/mcp.md on GitHub",
		back: "All docs",
	},
	zh: {
		title: "文档 | Guitar Pal",
		description: "Guitar Pal 的使用指南：安装到主屏幕、接入你的 AI、助手能读懂什么。",
		heading: "文档",
		lead: "把 Guitar Pal 用得更顺手。",
		devLead: "开发者：MCP 服务器的完整说明见",
		devLink: "GitHub 上的 docs/mcp.md",
		back: "全部文档",
	},
};
