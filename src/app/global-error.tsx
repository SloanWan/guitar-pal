"use client";

import { useEffect } from "react";
import "./globals.css";
import { figtree, mono } from "./fonts/fonts";
import StatusScreen, { StatusTab } from "@/components/status/StatusScreen";
import { MUTES } from "@/components/status/ErrorScreen";
import { restoreSavedTheme } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

/**
 * The last resort: the root layout itself threw, so this replaces the whole
 * document — no shell, no providers, its own <html>. The theme the boot
 * script would have set is restored here instead, and the way home is a plain
 * link, a full load, since the client router may be what broke.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
	useEffect(() => {
		console.error(error);
		restoreSavedTheme();
	}, [error]);

	return (
		<html lang="en" className={`${mono.variable} ${figtree.variable} h-full antialiased`}>
			<body className="h-full bg-gp-page">
				<title>Something went wrong · Guitar Pal</title>
				<StatusScreen
					art={<StatusTab notes={MUTES} snapped={3} />}
					title="A string snapped."
					lead="Guitar Pal couldn't load. Try again, or start over from the home page."
				>
					<div className="flex flex-wrap justify-center gap-3">
						<Button onClick={() => retry()}>Try again</Button>
						<Button variant="secondary" asChild>
							{/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load on purpose: the router may be what broke */}
							<a href="/">Back to Guitar Pal</a>
						</Button>
					</div>
				</StatusScreen>
			</body>
		</html>
	);
}
