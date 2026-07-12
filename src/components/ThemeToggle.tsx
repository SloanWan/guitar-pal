"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

// Must match the key the FOUC boot script in src/app/layout.tsx reads.
const THEME_STORAGE_KEY = "gp-theme";

function subscribeToTheme(onChange: () => void): () => void {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributeFilter: ["data-theme"],
	});
	return () => observer.disconnect();
}

function getTheme(): Theme {
	return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerTheme(): Theme {
	// Dark is the token default on :root; the boot script overrides before paint.
	return "dark";
}

function applyTheme(next: Theme): void {
	document.documentElement.dataset.theme = next;
	localStorage.setItem(THEME_STORAGE_KEY, next);
}

export default function ThemeToggle() {
	// Icon visibility is pure CSS via the data-theme-bound `dark:` variant, so SSR
	// markup matches the client (both icons render; CSS reveals exactly one). The
	// store only drives the accessible pressed state and the click target.
	const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);

	return (
		<button
			type="button"
			aria-label="Toggle dark mode"
			aria-pressed={theme === "dark"}
			onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
			className="flex size-9 items-center justify-center border border-line-strong text-ink-dim transition-[color,background-color,border-color,transform,translate] duration-(--dur-hover) ease-out hover:border-denim hover:text-denim-accent motion-safe:active:translate-y-px active:border-denim active:bg-denim-tint active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
		>
			{/* Mechanical two-sided flip driven purely by [data-theme] (SSR-safe,
			    no mount-flash): the container rotates and backface-visibility swaps
			    Sun↔Moon at the 90° midpoint so it reads as a relay switch, not a
			    cross-fade. The visible icon shows the theme the click switches TO —
			    Sun in dark (→ light), Moon in light (→ dark). */}
			<span className="block size-[18px] [perspective:420px]">
				<span className="relative block size-[18px] rotate-y-180 transform-3d transition-transform duration-(--dur-theme) ease-out motion-reduce:transition-none dark:rotate-y-0">
					<Sun
						className="absolute inset-0 size-[18px] backface-hidden"
						strokeWidth={1.5}
						strokeLinecap="square"
						aria-hidden="true"
					/>
					<Moon
						className="absolute inset-0 size-[18px] rotate-y-180 backface-hidden"
						strokeWidth={1.5}
						strokeLinecap="square"
						aria-hidden="true"
					/>
				</span>
			</span>
		</button>
	);
}
