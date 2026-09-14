"use client";

import { Moon, Settings, Sun } from "lucide-react";
import Link from "@/components/AppLink";
import type { Profile } from "@/lib/profile";
import UserAvatar from "./UserAvatar";
import UserIdentity from "./UserIdentity";
import LogoutButton from "./LogoutButton";
import { useTheme } from "./ThemeToggle";
import Rocker from "@/components/ui/Rocker";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The signed-in account control, rightmost in the topbar at every width: the
 * avatar chip is the trigger, and the panel carries the identity row, the
 * settings page, the theme rocker and sign-out. Trigger chrome matches the
 * other square topbar controls (same border, hover, open state).
 */
export default function UserMenu({ profile }: { profile: Profile }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`Account: ${profile.displayName}`}
				// Radix only preventDefaults the pointerdown that *opens* the menu, so
				// the second click of a double-click reaches the browser and starts a
				// text selection that runs from the chip into the page. Swallow any
				// click past the first; single clicks keep their default handling.
				onMouseDown={(e) => {
					if (e.detail > 1) e.preventDefault();
				}}
				className="flex size-(--h-control) items-center justify-center border border-line-strong transition-[border-color,opacity] duration-(--dur-hover) ease-out hover:border-denim hover:opacity-90 active:border-denim active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 data-[state=open]:border-denim"
			>
				{/* Inset by the trigger's 1px border, so the fill sits inside the frame
				    rather than under it. */}
				<UserAvatar profile={profile} className="size-[calc(var(--h-control)-2px)]" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" sideOffset={8} className="w-60 p-2">
				<UserIdentity profile={profile} />

				<DropdownMenuSeparator className="mx-0 my-2" />

				{/* Classes go on the item, not the link: the item runs them through
				    tailwind-merge against its defaults, while asChild's Slot would only
				    concatenate a className set on the Link. */}
				<DropdownMenuItem
					asChild
					className="h-(--h-control) cursor-pointer gap-2 rounded-none px-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim focus:bg-denim-tint focus:text-denim-accent"
				>
					<Link href="/settings">
						<Settings className="size-3.5" strokeWidth={1.5} strokeLinecap="square" />
						Settings
					</Link>
				</DropdownMenuItem>

				{/* Theme is a dev-only affordance; production ships a single theme, so
				    the row renders only when dev routes are on (NEXT_PUBLIC_ vars
				    inline at build time). A control row, not a menu item: the rocker
				    flips without dismissing the menu. */}
				{process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === "1" && <ThemeRow />}

				<DropdownMenuSeparator className="mx-0 my-2" />

				<LogoutButton className="w-full justify-center" />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** `Theme  ☀ [rocker] ☾` — the block sits under the icon of the active theme. */
function ThemeRow() {
	const { theme, setTheme } = useTheme();
	const dark = theme === "dark";
	return (
		<div className="flex h-(--h-control) items-center justify-between gap-4 px-2">
			<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
				Theme
			</span>
			<span className="flex items-center gap-1.5">
				<Sun
					className={`size-3.5 ${dark ? "text-ink-faint" : "text-denim-accent"}`}
					strokeWidth={1.5}
					strokeLinecap="square"
					aria-hidden="true"
				/>
				<Rocker
					checked={dark}
					onChange={(next) => setTheme(next ? "dark" : "light")}
					ariaLabel="Dark mode"
				/>
				<Moon
					className={`size-3.5 ${dark ? "text-denim-accent" : "text-ink-faint"}`}
					strokeWidth={1.5}
					strokeLinecap="square"
					aria-hidden="true"
				/>
			</span>
		</div>
	);
}
