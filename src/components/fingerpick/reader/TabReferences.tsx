"use client";

import { useRef, useState, type FormEvent } from "react";
import { Globe, Link2, MonitorPlay, Music, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	MAX_REFERENCE_LABEL,
	MAX_REFERENCES,
	cleanReferenceLabel,
	readReferenceUrl,
	referenceShortUrl,
	referenceSite,
	referenceTitle,
	type ReferenceSite,
	type TabReference,
} from "@/lib/tabReferences";

const SITE_ICON: Record<ReferenceSite, typeof Globe> = {
	youtube: MonitorPlay,
	bilibili: MonitorPlay,
	spotify: Music,
	netease: Music,
	web: Globe,
};

interface Props {
	references: TabReference[];
	/** The player's own tab: links can be added and removed. Else the list is read only. */
	editable: boolean;
	onChange: (next: TabReference[]) => void;
}

/**
 * The tab's reference links behind one icon beside its name (#434): where it came
 * from, each opening its site in a new tab. Nothing is embedded or fetched. Absent
 * when there is nothing to show and nothing can be added — a preset, a share
 * without links.
 */
export default function TabReferences({ references, editable, onChange }: Props) {
	const [url, setUrl] = useState("");
	const [label, setLabel] = useState("");
	const [error, setError] = useState<string | null>(null);
	const urlRef = useRef<HTMLInputElement>(null);
	if (!editable && references.length === 0) return null;

	const full = references.length >= MAX_REFERENCES;
	const count = references.length;

	function add(e: FormEvent) {
		e.preventDefault();
		const read = readReferenceUrl(url);
		if ("error" in read) {
			setError(read.error);
			return;
		}
		if (references.some((r) => r.url === read.url)) {
			setError("That link is already here.");
			return;
		}
		const name = cleanReferenceLabel(label);
		onChange([...references, { id: crypto.randomUUID(), url: read.url, ...(name ? { label: name } : {}) }]);
		setUrl("");
		setLabel("");
		setError(null);
		urlRef.current?.focus();
	}

	const name = count === 0 ? "Add a reference link" : `Reference links (${count})`;
	return (
		<Popover onOpenChange={(open) => !open && setError(null)}>
			<PopoverTrigger asChild>
				<button type="button" className="pb-icon tb-refs-key" aria-label={name} title={name}>
					<Link2 aria-hidden />
					{count > 0 && <span className="pb-num">{count}</span>}
				</button>
			</PopoverTrigger>
			<PopoverContent aria-label="Reference links" className="tb-refs w-80" data-m="tab" align="start">
				<div className="tb-view-head">
					<span className="tb-view-name">References</span>
				</div>
				{count > 0 ? (
					<ul className="tb-refs-list">
						{references.map((ref) => {
							const Icon = SITE_ICON[referenceSite(ref.url)];
							const title = referenceTitle(ref);
							return (
								<li key={ref.id} className="tb-ref">
									<a href={ref.url} target="_blank" rel="noopener noreferrer" className="tb-ref-link">
										<Icon aria-hidden />
										<span className="tb-ref-text">
											<span className="tb-ref-title">{title}</span>
											<span className="tb-ref-url">{referenceShortUrl(ref.url)}</span>
										</span>
									</a>
									{editable && (
										<button
											type="button"
											className="pb-icon tb-ref-remove"
											onClick={() => onChange(references.filter((r) => r.id !== ref.id))}
											aria-label={`Remove ${title}`}
											title="Remove"
										>
											<X aria-hidden />
										</button>
									)}
								</li>
							);
						})}
					</ul>
				) : (
					<p className="tb-refs-empty">Keep the video, track or page this tab came from. Each link opens its site.</p>
				)}
				{editable && (
					<form className="tb-refs-add" onSubmit={add} noValidate>
						<Input
							ref={urlRef}
							type="url"
							inputMode="url"
							value={url}
							onChange={(e) => {
								setUrl(e.target.value);
								setError(null);
							}}
							placeholder="Paste a link"
							aria-label="Link"
							aria-invalid={error ? true : undefined}
							disabled={full}
						/>
						<div className="tb-refs-row">
							<Input
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								placeholder="Name (optional)"
								aria-label="Name"
								maxLength={MAX_REFERENCE_LABEL}
								disabled={full}
							/>
							<Button type="submit" variant="secondary" size="sm" disabled={full || !url.trim()}>
								Add
							</Button>
						</div>
						{/* One line, always there, so the card keeps its height. */}
						<p className="tb-refs-note" data-error={error ? "" : undefined} role={error ? "alert" : undefined}>
							{error ?? (full ? `A tab keeps up to ${MAX_REFERENCES} links.` : "YouTube, bilibili, Spotify, NetEase or any web page.")}
						</p>
					</form>
				)}
			</PopoverContent>
		</Popover>
	);
}
