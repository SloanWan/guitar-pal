"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export type Theme = "dark" | "light";

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
	return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerTheme(): Theme {
	// Light is the default (#356); the boot script applies a saved dark before paint.
	return "light";
}

function applyTheme(next: Theme): void {
	document.documentElement.dataset.theme = next;
	localStorage.setItem(THEME_STORAGE_KEY, next);
}

/**
 * Puts the saved theme back on `<html>`. The boot script sets it before first
 * paint, but when a render error makes React rebuild the document on the
 * client the attribute is dropped, and the page falls back to the v3 dark
 * tokens under the Candy light ones. The error screens call this.
 */
export function restoreSavedTheme(): void {
	let saved: string | null = null;
	try {
		saved = localStorage.getItem(THEME_STORAGE_KEY);
	} catch {
		// Storage can be blocked; light is the default anyway.
	}
	document.documentElement.dataset.theme = saved === "dark" ? "dark" : "light";
}

/**
 * The current theme and a setter, backed by `<html data-theme>` rather than
 * React state so every consumer (the header button, the switch in the account
 * menu, More and Settings) agrees with the FOUC boot script and with each other.
 */
export function useTheme(): { theme: Theme; setTheme: (next: Theme) => void } {
	const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);
	return { theme, setTheme: applyTheme };
}

/** "Dark theme" as a switch — the control in the account menu, More and Settings. */
export function ThemeSwitch({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme();
	return (
		<Switch
			label="Dark theme"
			className={className}
			checked={theme === "dark"}
			onCheckedChange={(on) => setTheme(on ? "dark" : "light")}
		/>
	);
}

/**
 * The header's theme button for a signed-out visitor, who has no account menu to hold
 * the switch. The icon is the theme a press switches to; CSS picks it from data-theme,
 * so the server markup already shows the right one.
 */
export default function ThemeToggle({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme();
	return (
		<Button
			variant="icon"
			size="sm"
			aria-label="Dark theme"
			aria-pressed={theme === "dark"}
			className={className}
			onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
		>
			<Moon className="dark:hidden" aria-hidden />
			<Sun className="hidden dark:block" aria-hidden />
		</Button>
	);
}
