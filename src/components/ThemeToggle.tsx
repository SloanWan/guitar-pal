"use client";

import { useSyncExternalStore } from "react";

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

function getServerTheme(): Theme | null {
	return null;
}

function applyTheme(next: Theme): void {
	document.documentElement.dataset.theme = next;
	localStorage.setItem(THEME_STORAGE_KEY, next);
}

const segmentBase =
	"px-2 py-1.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1";

export default function ThemeToggle() {
	// Visual active state is pure CSS via the data-theme-bound `dark:` variant,
	// so SSR markup matches the client; the store only drives aria-pressed.
	const theme = useSyncExternalStore(
		subscribeToTheme,
		getTheme,
		getServerTheme,
	);

	return (
		<div
			role="group"
			aria-label="Switch color theme"
			className="flex border border-line-strong font-mono text-[9px] tracking-[0.1em]"
		>
			<button
				type="button"
				aria-pressed={theme === null ? undefined : theme === "dark"}
				onClick={() => applyTheme("dark")}
				className={`${segmentBase} text-ink-faint dark:bg-raise dark:text-denim-accent`}
			>
				DARK
			</button>
			<button
				type="button"
				aria-pressed={theme === null ? undefined : theme === "light"}
				onClick={() => applyTheme("light")}
				className={`${segmentBase} border-l border-line-strong bg-raise text-denim-accent dark:bg-transparent dark:text-ink-faint`}
			>
				LIGHT
			</button>
		</div>
	);
}
