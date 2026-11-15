import type { Metadata } from "next";
import { headers } from "next/headers";
import InstallGuide from "@/components/docs/InstallGuide";
import { INSTALL_GUIDE_COPY } from "@/components/docs/installGuideCopy";
import { PAGE_GUTTER } from "@/components/auth/formText";
import { resolveDocLang, type DocSearchParams } from "@/lib/docs/markdownDoc";
import { platformFromUserAgent } from "@/lib/pwa/installPlatform";

/**
 * How to add Guitar Pal to the home screen (#525). `?lang=zh` picks the
 * language, else the browser's preference; the device's own steps show first.
 */

export async function generateMetadata({ searchParams }: { searchParams: DocSearchParams }): Promise<Metadata> {
	const copy = INSTALL_GUIDE_COPY[await resolveDocLang(searchParams)];
	return { title: copy.title, description: copy.description };
}

export default async function InstallDocPage({ searchParams }: { searchParams: DocSearchParams }) {
	const lang = await resolveDocLang(searchParams);
	const platform = platformFromUserAgent((await headers()).get("user-agent"));
	return (
		<div
			className={`gp-rise mx-auto flex w-full max-w-300 flex-col py-8 max-sm:py-6 min-[960px]:flex-row min-[960px]:gap-12 ${PAGE_GUTTER}`}
		>
			<InstallGuide lang={lang} platform={platform} />
		</div>
	);
}
