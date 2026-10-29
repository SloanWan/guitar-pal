"use client";

import { Download, Share2 } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import "./share.css";

/**
 * What a shared snapshot (/p/[id]) shows in place of the library, on Strum and Tab
 * alike: a badge before the meta line, Import in the title row, and one line under it
 * saying what this is and where a copy goes.
 */

/** Leads the meta line: the snapshot came from someone else. */
export function SharedBadge() {
	return (
		<span className="sh-badge">
			<Share2 aria-hidden />
			Shared with you
		</span>
	);
}

/** The one way to change a snapshot: a copy in the viewer's own library. */
export function ImportCopy({
	onImport,
	importing,
	disabled = false,
}: {
	onImport: () => void;
	importing: boolean;
	/** The viewer, or their own library, is still loading: the copy has nowhere to go yet. */
	disabled?: boolean;
}) {
	return (
		<Button size="xs" className="sh-import" onClick={onImport} loading={importing} disabled={disabled}>
			<Download aria-hidden />
			{/* one flex item, so the button's gap does not split the words */}
			<span>
				Import<span className="sh-wide"> a copy</span>
			</span>
		</Button>
	);
}

/** A guest's copy stays in this browser, so a guest is also offered to sign in. */
export function ShareNote({ guest }: { guest: boolean }) {
	const pathname = usePathname();
	return (
		<p className="sh-note">
			<span>
				A snapshot someone sent you. Play it here; import a copy to change it
				{guest ? ": it stays in this browser until you sign in." : "."}
			</span>
			{guest && <Link href={`/auth?redirect=${encodeURIComponent(pathname)}`}>Sign in</Link>}
		</p>
	);
}
