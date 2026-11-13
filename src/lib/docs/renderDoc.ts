import { Marked, type Token, type Tokens } from "marked";

/**
 * A Markdown document as a page: the title, the HTML under it, and the
 * headings a sidebar lists. Headings get ids so the sidebar can link to them;
 * the first `#` is the title, taken out of the HTML (the page sets it in its
 * own row, beside the language switch) and out of the outline; `##` and `###`
 * are in the outline.
 *
 * The documents this renders are the repo's own (`docs/*.md`), never a
 * visitor's, which is why the HTML is trusted as written.
 */

export interface TocEntry {
	id: string;
	text: string;
	depth: 2 | 3;
}

export interface RenderedDoc {
	/** The first `#`, as plain text (for metadata) and as inline HTML (for the page). */
	title: string;
	titleHtml: string;
	/** Everything but the title. */
	html: string;
	toc: TocEntry[];
}

/** "Chords and rhythm on one line" → "chords-and-rhythm-on-one-line". Letters of any script are kept. */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{N}\s-]/gu, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

/** The words of a heading with the markup taken out: `Read before **anything**` → "Read before anything". */
export function plainText(tokens: readonly Token[]): string {
	return tokens
		.map((token) => {
			if ("tokens" in token && token.tokens) return plainText(token.tokens);
			return "text" in token ? token.text : "";
		})
		.join("");
}

/** The slug, or the slug with a count behind it when a heading has already taken it. */
function uniqueId(slug: string, taken: Map<string, number>): string {
	const seen = taken.get(slug) ?? 0;
	taken.set(slug, seen + 1);
	return seen === 0 ? slug : `${slug}-${seen + 1}`;
}

export function renderDoc(markdown: string): RenderedDoc {
	const toc: TocEntry[] = [];
	const taken = new Map<string, number>();
	let title = "";
	let titleHtml = "";

	const marked = new Marked({
		gfm: true,
		renderer: {
			heading({ tokens, depth }: Tokens.Heading): string {
				const text = plainText(tokens);
				const inner = this.parser.parseInline(tokens);
				if (depth === 1) {
					if (title !== "") return `<h1>${inner}</h1>\n`;
					title = text;
					titleHtml = inner;
					return "";
				}
				const id = uniqueId(slugify(text) || `section-${toc.length + 1}`, taken);
				if (depth === 2 || depth === 3) toc.push({ id, text, depth });
				return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
			},
		},
	});

	const html = marked.parse(markdown, { async: false });
	return { title, titleHtml, html, toc };
}
