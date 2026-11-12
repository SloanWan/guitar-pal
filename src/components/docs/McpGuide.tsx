"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { TEXT_LINK } from "@/components/auth/formText";
import DocLangSwitch from "@/components/docs/DocLangSwitch";
import { MCP_GUIDE_COPY, MCP_REFERENCE_URL, type McpGuideCopy } from "@/components/docs/mcpGuideCopy";
import type { DocLang } from "@/lib/docs/docLang";
import { CONNECT_CLIENTS, MCP_URL, connectSnippets, type ConnectClient } from "@/lib/mcp/connectGuide";

/**
 * `/docs/mcp`: how to add the MCP server to an AI app, quickly. The URL
 * first, then one client's steps at a time, then what to ask and what comes
 * back. The full reference stays `docs/mcp.md`, linked at the foot.
 */

const SNIPPETS = connectSnippets();
const COPIED_MS = 1500;

/** Text with backticked runs drawn as code. */
function Inline({ text }: { text: string }) {
	return text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

function CopyButton({ text, label, copy }: { text: string; label: string; copy: McpGuideCopy }) {
	const [done, setDone] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);

	const onClick = async () => {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			toast(copy.copyFailed);
			return;
		}
		toast(copy.copied);
		setDone(true);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setDone(false), COPIED_MS);
	};

	return (
		<Button variant="icon" size="xs" aria-label={label} onClick={onClick}>
			{done ? <Check aria-hidden /> : <Copy aria-hidden />}
		</Button>
	);
}

function Snippet({ text, label, copy }: { text: string; label: string; copy: McpGuideCopy }) {
	return (
		<div className="mcp-snippet">
			<pre>
				<code>{text}</code>
			</pre>
			<CopyButton text={text} label={label} copy={copy} />
		</div>
	);
}

export default function McpGuide({ lang }: { lang: DocLang }) {
	const copy = MCP_GUIDE_COPY[lang];
	const [client, setClient] = useState<ConnectClient>("claude");
	const guide = copy.clients[client];

	return (
		<article lang={lang} className="mcp-page gp-rise">
			<header>
				<div className="mcp-title-row">
					<h1>{copy.heading}</h1>
					<DocLangSwitch lang={lang} />
				</div>
				<p className="mcp-lead">{copy.lead}</p>
			</header>

			<section className="mcp-url" aria-labelledby="mcp-url-label">
				<p id="mcp-url-label" className="mcp-caption">
					{copy.urlLabel}
				</p>
				<div className="mcp-url-row">
					<code className="mcp-url-value">{MCP_URL}</code>
					<CopyButton text={MCP_URL} label={copy.copy(copy.clients.claude.snippetName)} copy={copy} />
				</div>
				<p className="mcp-url-note">{copy.urlNote}</p>
			</section>

			<section aria-labelledby="mcp-clients">
				<h2 id="mcp-clients">{copy.clientsHeading}</h2>
				<div className="mcp-picker">
					<Segmented
						label={copy.clientsLabel}
						options={CONNECT_CLIENTS.map((c) => ({ value: c, label: copy.clients[c].label }))}
						value={client}
						onChange={setClient}
					/>
				</div>
				<div className="mcp-panel">
					<ol className="mcp-steps">
						{guide.steps.map((step, i) => (
							<li key={i}>
								<p>
									<Inline text={step} />
								</p>
								{i === guide.snippetAfter && (
									<Snippet text={SNIPPETS[client]} label={copy.copy(guide.snippetName)} copy={copy} />
								)}
							</li>
						))}
					</ol>
					{guide.note && (
						<p className="mcp-note">
							<Inline text={guide.note} />
						</p>
					)}
				</div>
			</section>

			<section aria-labelledby="mcp-ask">
				<h2 id="mcp-ask">{copy.askHeading}</h2>
				<p>{copy.askLead}</p>
				<ul className="mcp-asks">
					{copy.asks.map((ask) => (
						<li key={ask.text}>
							<div className="mcp-ask-body">
								{ask.hint && <p className="mcp-caption">{ask.hint}</p>}
								<p className="mcp-ask-text">{ask.text}</p>
							</div>
							<CopyButton text={ask.text} label={copy.copy(copy.askName)} copy={copy} />
						</li>
					))}
				</ul>
			</section>

			<section aria-labelledby="mcp-back">
				<h2 id="mcp-back">{copy.backHeading}</h2>
				<ul className="mcp-back">
					{copy.back.map((line) => (
						<li key={line}>
							<Inline text={line} />
						</li>
					))}
				</ul>
			</section>

			<p className="mcp-reference">
				{copy.referenceLead}{" "}
				<a href={MCP_REFERENCE_URL} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>
					{copy.referenceLink}
				</a>
			</p>
		</article>
	);
}
