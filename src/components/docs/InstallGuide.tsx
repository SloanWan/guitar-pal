"use client";

import { useMemo, useState } from "react";
import Link from "@/components/AppLink";
import { Segmented } from "@/components/ui/segmented";
import { TEXT_LINK } from "@/components/auth/formText";
import DocBackLink from "@/components/docs/DocBackLink";
import DocLangSwitch from "@/components/docs/DocLangSwitch";
import DocToc from "@/components/docs/DocToc";
import Inline from "@/components/docs/Inline";
import { INSTALL_GUIDE_COPY, type InstallGuideCopy } from "@/components/docs/installGuideCopy";
import InstallDemo from "@/components/install/InstallDemo";
import type { DocLang } from "@/lib/docs/docLang";
import type { TocEntry } from "@/lib/docs/renderDoc";
import { INSTALL_PLATFORMS, type InstallPlatform } from "@/lib/pwa/installPlatform";
import "./guide.css";

/**
 * `/docs/install` (#525): how to add Guitar Pal to the home screen, one
 * platform's steps at a time (the visitor's own first, told by the server),
 * acted out on a phone for the two phones, then what works with no
 * connection, updates and removing it. Laid out like `/docs/mcp`.
 */

function outline(copy: InstallGuideCopy): TocEntry[] {
	return [
		{ id: "install-add", text: copy.platformsHeading, depth: 2 },
		{ id: "install-offline", text: copy.offlineHeading, depth: 2 },
		{ id: "install-updates", text: copy.updatesHeading, depth: 2 },
		{ id: "install-remove", text: copy.removeHeading, depth: 2 },
	];
}

export default function InstallGuide({ lang, platform: initial }: { lang: DocLang; platform: InstallPlatform }) {
	const copy = INSTALL_GUIDE_COPY[lang];
	const [platform, setPlatform] = useState<InstallPlatform>(initial);
	const guide = copy.platforms[platform];
	const entries = useMemo(() => outline(copy), [copy]);

	return (
		<>
			<DocToc entries={entries} label={copy.tocLabel} />
			<article lang={lang} className="guide-page">
				<header>
					<DocBackLink lang={lang} />
					<div className="guide-title-row">
						<h1>{copy.heading}</h1>
						<DocLangSwitch lang={lang} />
					</div>
					<p className="guide-lead">{copy.lead}</p>
				</header>

				<section aria-labelledby="install-add">
					<h2 id="install-add">{copy.platformsHeading}</h2>
					<div className="guide-picker">
						<Segmented
							label={copy.platformsLabel}
							options={INSTALL_PLATFORMS.map((p) => ({ value: p, label: copy.platforms[p].label }))}
							value={platform}
							onChange={setPlatform}
						/>
					</div>
					<div className="guide-panel">
						{platform !== "desktop" && (
							<div className="mb-5 border-b border-gp-line pb-5">
								<InstallDemo key={platform} platform={platform} lang={lang} />
							</div>
						)}
						<ol className="guide-steps">
							{guide.steps.map((step, i) => (
								<li key={i}>
									<p>
										<Inline text={step} />
									</p>
								</li>
							))}
						</ol>
						{guide.note && (
							<p className="guide-note">
								<Inline text={guide.note} />
							</p>
						)}
					</div>
				</section>

				<section aria-labelledby="install-offline">
					<h2 id="install-offline">{copy.offlineHeading}</h2>
					<p>{copy.offlineLead}</p>
					<div className="mt-4 grid gap-3 min-[720px]:grid-cols-2">
						<div className="guide-panel">
							<h3>{copy.worksHeading}</h3>
							<ul className="guide-list mt-2">
								{copy.works.map((line) => (
									<li key={line}>{line}</li>
								))}
							</ul>
						</div>
						<div className="guide-panel">
							<h3>{copy.notHeading}</h3>
							<ul className="guide-list mt-2">
								{copy.doesNot.map((line) => (
									<li key={line}>{line}</li>
								))}
							</ul>
						</div>
					</div>
				</section>

				<section aria-labelledby="install-updates">
					<h2 id="install-updates">{copy.updatesHeading}</h2>
					<p>{copy.updates}</p>
				</section>

				<section aria-labelledby="install-remove">
					<h2 id="install-remove">{copy.removeHeading}</h2>
					<ul className="guide-list">
						{INSTALL_PLATFORMS.map((p) => (
							<li key={p}>
								<Inline text={copy.platforms[p].remove} />
							</li>
						))}
					</ul>
					<p className="mt-3">{copy.removeNote}</p>
				</section>

				<p className="guide-reference">
					{copy.supportLead}{" "}
					<Link href={`/support?lang=${lang}`} className={TEXT_LINK}>
						{copy.supportLink}
					</Link>
				</p>
			</article>
		</>
	);
}
