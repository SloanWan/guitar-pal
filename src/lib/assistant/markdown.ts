import { Lexer, type Token, type Tokens } from "marked";

/**
 * A model's reply read as Markdown, into a small tree the panel draws as React
 * elements — never as HTML. The words are the model's, so nothing in them can
 * become markup: raw HTML is dropped to its text, an image to its alt text,
 * and a link keeps its href only when it is the web, mail or a page of ours.
 *
 * A single newline is a line break, the way a chat reads one.
 */

export type MdInline =
	| { kind: "text"; text: string }
	| { kind: "strong" | "em" | "del"; children: MdInline[] }
	| { kind: "code"; text: string }
	| { kind: "link"; href: string; children: MdInline[] }
	| { kind: "br" };

export type MdAlign = "left" | "center" | "right" | null;

export type MdBlock =
	| { kind: "p"; children: MdInline[] }
	| { kind: "heading"; level: number; children: MdInline[] }
	| { kind: "pre"; text: string }
	| { kind: "quote"; children: MdBlock[] }
	| { kind: "list"; ordered: boolean; start: number; items: MdBlock[][] }
	| { kind: "hr" }
	| { kind: "table"; align: MdAlign[]; header: MdInline[][]; rows: MdInline[][][] };

const SAFE_HREF = /^(https?:|mailto:)/i;

/** An href the panel may follow: the web, mail, or a path on this site (not `//host`). */
export function safeHref(href: string): string | null {
	const trimmed = href.trim();
	if (SAFE_HREF.test(trimmed)) return trimmed;
	if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
	return null;
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, "");

function inlines(tokens: readonly Token[] | undefined): MdInline[] {
	const out: MdInline[] = [];
	for (const token of tokens ?? []) {
		switch (token.type) {
			case "strong":
			case "em":
			case "del":
				out.push({ kind: token.type, children: inlines((token as Tokens.Strong).tokens) });
				break;
			case "codespan":
				out.push({ kind: "code", text: (token as Tokens.Codespan).text });
				break;
			case "br":
				out.push({ kind: "br" });
				break;
			case "link": {
				const link = token as Tokens.Link;
				const children = inlines(link.tokens);
				const href = safeHref(link.href);
				if (href) out.push({ kind: "link", href, children });
				else out.push(...children);
				break;
			}
			case "image":
				out.push({ kind: "text", text: (token as Tokens.Image).text });
				break;
			case "html": {
				const text = stripTags((token as Tokens.HTML).text);
				if (text) out.push({ kind: "text", text });
				break;
			}
			case "text": {
				const text = token as Tokens.Text;
				if (text.tokens && text.tokens.length > 0) out.push(...inlines(text.tokens));
				else out.push({ kind: "text", text: text.text });
				break;
			}
			default:
				if ("text" in token && typeof token.text === "string") out.push({ kind: "text", text: token.text });
		}
	}
	return out;
}

function blocks(tokens: readonly Token[]): MdBlock[] {
	const out: MdBlock[] = [];
	for (const token of tokens) {
		switch (token.type) {
			case "space":
			case "def":
				break;
			case "paragraph":
				out.push({ kind: "p", children: inlines((token as Tokens.Paragraph).tokens) });
				break;
			// A tight list item's words come as block-level text.
			case "text": {
				const text = token as Tokens.Text;
				out.push({ kind: "p", children: text.tokens ? inlines(text.tokens) : [{ kind: "text", text: text.text }] });
				break;
			}
			case "heading": {
				const heading = token as Tokens.Heading;
				out.push({ kind: "heading", level: heading.depth, children: inlines(heading.tokens) });
				break;
			}
			case "code":
				out.push({ kind: "pre", text: (token as Tokens.Code).text });
				break;
			case "blockquote":
				out.push({ kind: "quote", children: blocks((token as Tokens.Blockquote).tokens) });
				break;
			case "list": {
				const list = token as Tokens.List;
				out.push({
					kind: "list",
					ordered: list.ordered,
					start: typeof list.start === "number" ? list.start : 1,
					items: list.items.map((item) => blocks(item.tokens)),
				});
				break;
			}
			case "hr":
				out.push({ kind: "hr" });
				break;
			case "table": {
				const table = token as Tokens.Table;
				out.push({
					kind: "table",
					align: table.align,
					header: table.header.map((cell) => inlines(cell.tokens)),
					rows: table.rows.map((row) => row.map((cell) => inlines(cell.tokens))),
				});
				break;
			}
			case "html": {
				const text = stripTags((token as Tokens.HTML).text).trim();
				if (text) out.push({ kind: "p", children: [{ kind: "text", text }] });
				break;
			}
			default:
				if ("text" in token && typeof token.text === "string" && token.text.trim()) {
					out.push({ kind: "p", children: [{ kind: "text", text: token.text }] });
				}
		}
	}
	return out;
}

export function parseReply(text: string): MdBlock[] {
	return blocks(new Lexer({ gfm: true, breaks: true }).lex(text));
}

function inlineLength(nodes: readonly MdInline[]): number {
	return nodes.reduce((sum, node) => {
		if (node.kind === "text" || node.kind === "code") return sum + node.text.length;
		if (node.kind === "br") return sum + 1;
		return sum + inlineLength(node.children);
	}, 0);
}

/** The characters the reader sees — what the typing reveals one by one. A rule counts as one. */
export function visibleLength(tree: readonly MdBlock[]): number {
	return tree.reduce((sum, block) => {
		switch (block.kind) {
			case "p":
			case "heading":
				return sum + inlineLength(block.children);
			case "pre":
				return sum + block.text.length;
			case "quote":
				return sum + visibleLength(block.children);
			case "list":
				return sum + block.items.reduce((n, item) => n + visibleLength(item), 0);
			case "hr":
				return sum + 1;
			case "table":
				return (
					sum +
					block.header.reduce((n, cell) => n + inlineLength(cell), 0) +
					block.rows.reduce((n, row) => n + row.reduce((m, cell) => m + inlineLength(cell), 0), 0)
				);
		}
	}, 0);
}
