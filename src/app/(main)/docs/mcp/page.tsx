import type { Metadata } from "next";
import { headers } from "next/headers";
import McpGuide from "@/components/docs/McpGuide";
import { MCP_GUIDE_COPY } from "@/components/docs/mcpGuideCopy";
import { PAGE_GUTTER } from "@/components/auth/formText";
import { isDocLang, preferredDocLang, type DocLang } from "@/lib/docs/docLang";
import "./mcp.css";

/**
 * How to connect the MCP server (#486): the page a player is sent to from
 * the landing. `?lang=zh` picks the language; without it the browser's own
 * preference does, as on the assistant's grammar page.
 */

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function resolveLang(searchParams: SearchParams): Promise<DocLang> {
	const { lang } = await searchParams;
	if (isDocLang(lang)) return lang;
	return preferredDocLang((await headers()).get("accept-language"));
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
	const copy = MCP_GUIDE_COPY[await resolveLang(searchParams)];
	return { title: copy.title, description: copy.description };
}

export default async function McpDocPage({ searchParams }: { searchParams: SearchParams }) {
	const lang = await resolveLang(searchParams);
	return (
		<div
			className={`gp-rise mx-auto flex w-full max-w-300 flex-col py-8 max-sm:py-6 min-[960px]:flex-row min-[960px]:gap-12 ${PAGE_GUTTER}`}
		>
			<McpGuide lang={lang} />
		</div>
	);
}
