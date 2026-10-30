"use client";

import type { ReactNode } from "react";
import Link from "@/components/AppLink";
import { closeAssistant } from "@/lib/assistant/handoff";
import type { MdBlock, MdInline } from "@/lib/assistant/markdown";

/**
 * A model's reply, drawn from its parsed tree (`parseReply`) as elements, never
 * as HTML. `shown` is how many of its visible characters are out yet: the
 * typing reveals the formatted words, so half a `**bold**` never shows as
 * asterisks.
 */

interface Budget {
	left: number;
}

function inline(nodes: readonly MdInline[], budget: Budget): ReactNode[] {
	const out: ReactNode[] = [];
	for (const [i, node] of nodes.entries()) {
		if (budget.left <= 0) break;
		switch (node.kind) {
			case "text": {
				out.push(node.text.slice(0, budget.left));
				budget.left -= node.text.length;
				break;
			}
			case "code": {
				out.push(<code key={i}>{node.text.slice(0, budget.left)}</code>);
				budget.left -= node.text.length;
				break;
			}
			case "br":
				out.push(<br key={i} />);
				budget.left -= 1;
				break;
			case "strong":
				out.push(<strong key={i}>{inline(node.children, budget)}</strong>);
				break;
			case "em":
				out.push(<em key={i}>{inline(node.children, budget)}</em>);
				break;
			case "del":
				out.push(<del key={i}>{inline(node.children, budget)}</del>);
				break;
			case "link":
				out.push(
					node.href.startsWith("/") ? (
						<Link key={i} href={node.href} onClick={closeAssistant}>
							{inline(node.children, budget)}
						</Link>
					) : (
						<a key={i} href={node.href} target="_blank" rel="noopener noreferrer">
							{inline(node.children, budget)}
						</a>
					),
				);
				break;
		}
	}
	return out;
}

function blocks(tree: readonly MdBlock[], budget: Budget): ReactNode[] {
	const out: ReactNode[] = [];
	for (const [i, block] of tree.entries()) {
		if (budget.left <= 0) break;
		switch (block.kind) {
			case "p":
				out.push(<p key={i}>{inline(block.children, budget)}</p>);
				break;
			case "heading":
				// A bubble is too small for a page's headings: a heading is a bold line.
				out.push(
					<p key={i} className="as-md-h">
						{inline(block.children, budget)}
					</p>,
				);
				break;
			case "pre":
				out.push(<pre key={i}>{block.text.slice(0, budget.left)}</pre>);
				budget.left -= block.text.length;
				break;
			case "quote":
				out.push(<blockquote key={i}>{blocks(block.children, budget)}</blockquote>);
				break;
			case "list": {
				const items: ReactNode[] = [];
				for (const [j, item] of block.items.entries()) {
					if (budget.left <= 0) break;
					items.push(<li key={j}>{blocks(item, budget)}</li>);
				}
				out.push(
					block.ordered ? (
						<ol key={i} start={block.start}>
							{items}
						</ol>
					) : (
						<ul key={i}>{items}</ul>
					),
				);
				break;
			}
			case "hr":
				out.push(<hr key={i} />);
				budget.left -= 1;
				break;
			case "table": {
				const align = (j: number) => block.align[j] ?? undefined;
				const header = block.header.map((cell, j) => (
					<th key={j} style={{ textAlign: align(j) }}>
						{inline(cell, budget)}
					</th>
				));
				const rows: ReactNode[] = [];
				for (const [r, row] of block.rows.entries()) {
					if (budget.left <= 0) break;
					rows.push(
						<tr key={r}>
							{row.map((cell, j) => (
								<td key={j} style={{ textAlign: align(j) }}>
									{inline(cell, budget)}
								</td>
							))}
						</tr>,
					);
				}
				out.push(
					<div key={i} className="as-md-table">
						<table>
							<thead>
								<tr>{header}</tr>
							</thead>
							<tbody>{rows}</tbody>
						</table>
					</div>,
				);
				break;
			}
		}
	}
	return out;
}

export default function ReplyMarkdown({ tree, shown }: { tree: readonly MdBlock[]; shown: number }) {
	return <div className="as-md">{blocks(tree, { left: shown })}</div>;
}
