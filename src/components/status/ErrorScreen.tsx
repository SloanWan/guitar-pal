"use client";

import { useEffect } from "react";
import Link from "@/components/AppLink";
import StatusScreen, { StatusTab } from "@/components/status/StatusScreen";
import { Button } from "@/components/ui/button";
import { FORM_HELP } from "@/components/auth/formText";
import { restoreSavedTheme } from "@/components/ThemeToggle";

/* A muted string on either side of the break. */
export const MUTES = [
	[60, 3, "x"],
	[180, 3, "x"],
] as const;

export interface ErrorScreenProps {
	error: Error & { digest?: string };
	retry: () => void;
}

/**
 * What a route group's `error.tsx` shows: the page threw, the shell around it
 * is still standing. "Try again" re-fetches and re-renders the segment; the
 * digest is the id the server logs carry, for a bug report.
 */
export default function ErrorScreen({ error, retry }: ErrorScreenProps) {
	useEffect(() => {
		console.error(error);
		restoreSavedTheme();
	}, [error]);

	return (
		<StatusScreen
			art={<StatusTab notes={MUTES} snapped={3} />}
			title="A string snapped."
			lead="Something on this page went wrong. Try again — if it keeps happening, reloading the page usually clears it."
		>
			<div className="flex flex-wrap justify-center gap-3">
				<Button onClick={() => retry()}>Try again</Button>
				<Button variant="secondary" asChild>
					<Link href="/">Back to Guitar Pal</Link>
				</Button>
			</div>
			{error.digest && <p className={`${FORM_HELP} font-num`}>Error ID {error.digest}</p>}
		</StatusScreen>
	);
}
