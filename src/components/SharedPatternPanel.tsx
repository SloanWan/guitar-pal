"use client";

import type { User } from "@supabase/supabase-js";
import { Download, Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "@/components/AppLink";

interface SharedPatternPanelProps {
	/** `sidebar` fills the library's column at lg; `strip` sits over the tab below it. */
	variant: "sidebar" | "strip";
	/** The shared pattern's name, and a one-line summary (tempo, meter, size, capo). */
	name: string;
	meta: string;
	user: User | null;
	/** The user is still being resolved: the import must not guess guest or account. */
	loading: boolean;
	importing: boolean;
	onImport: () => void;
}

/**
 * What stands in for the library on a shared snapshot (/p/[id]), fingerpick or
 * strum: what this is, and the one thing to do with it — import a copy into
 * the viewer's own library, which is also the only way to edit it.
 */
export default function SharedPatternPanel({
	variant,
	name,
	meta,
	user,
	loading,
	importing,
	onImport,
}: SharedPatternPanelProps) {
	const pathname = usePathname();
	const signInHref = `/auth?redirect=${encodeURIComponent(pathname)}`;
	const hint = user ? (
		<>Want to change it? Importing saves a copy to your patterns, ready to edit.</>
	) : (
		<>
			Want to change it? Importing saves a copy you can edit — in this browser for now, or
			on your account once you{" "}
			<Link href={signInHref} className="text-denim underline-offset-2 hover:underline">
				sign in
			</Link>
			.
		</>
	);
	const button = (
		<button
			type="button"
			onClick={onImport}
			disabled={loading || importing}
			className={`flex items-center justify-center gap-2 border border-denim bg-denim text-on-denim transition-colors hover:bg-denim-accent active:bg-denim-accent disabled:pointer-events-none disabled:opacity-40 ${
				variant === "sidebar" ? "h-10 w-full text-[13px] font-semibold" : "h-8 shrink-0 px-3 text-xs font-semibold"
			}`}
		>
			{importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
			{variant === "sidebar" ? "Import to my library" : "Import"}
		</button>
	);

	if (variant === "strip") {
		return (
			<div className="border border-line bg-sidebar px-3 py-2.5">
				<div className="flex items-center justify-between gap-3">
					<span className="text-[10px] font-normal uppercase tracking-[0.18em] text-ink">
						Shared with you
					</span>
					{button}
				</div>
				<p className="mt-1.5 text-[11px] leading-snug text-ink-dim">{hint}</p>
			</div>
		);
	}

	return (
		<>
			<div className="flex items-center px-5 py-4 shrink-0 border-b border-line">
				<h2 className="text-[10px] font-normal uppercase tracking-[0.18em] text-ink">
					Shared with you
				</h2>
			</div>
			<div className="flex flex-col gap-4 px-5 py-5">
				<div className="flex flex-col gap-1">
					<span className="text-[13px] font-medium text-ink">{name}</span>
					<span className="text-xs uppercase tracking-wider text-tab-meta">{meta}</span>
				</div>
				{button}
				<p className="text-xs leading-relaxed text-ink-dim">{hint}</p>
			</div>
		</>
	);
}
