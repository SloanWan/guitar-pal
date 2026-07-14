"use client";

import Link from "next/link";
import { EllipsisVertical } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import LogoutButton from "./LogoutButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Below the `nav:` breakpoint the topbar can't fit the theme toggle and the
 * auth control side by side, so they collapse into this single icon trigger.
 * The panel reuses the exact same controls (ThemeToggle, LogoutButton, the
 * nav-CTA link) rather than re-styling them, so mobile and desktop stay in
 * lockstep. Rendered only under `nav:` — the desktop cluster owns ≥ nav:.
 */
export default function NavBarMenu({ userEmail }: { userEmail: string | null }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Open menu"
				className="flex size-(--h-control) items-center justify-center border border-line-strong text-ink-dim transition-[color,background-color,border-color] duration-(--dur-hover) ease-out hover:border-denim hover:text-denim-accent active:border-denim active:bg-denim-tint active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 data-[state=open]:border-denim data-[state=open]:text-denim-accent"
			>
				<EllipsisVertical
					className="size-4"
					strokeWidth={1.5}
					strokeLinecap="square"
					aria-hidden="true"
				/>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" sideOffset={8} className="w-56 p-2">
				{/* Theme: an inline control row (not a menu item — it wraps its own
				    interactive button, which toggles without dismissing the menu). */}
				<div className="flex items-center justify-between gap-4 pb-2">
					<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
						Theme
					</span>
					<ThemeToggle />
				</div>

				<DropdownMenuSeparator className="mx-0" />

				{userEmail ? (
					<div className="flex flex-col gap-2 pt-2">
						<span className="truncate font-mono text-[11px] tracking-[0.04em] text-ink-faint">
							{userEmail}
						</span>
						<LogoutButton className="w-full justify-center" />
					</div>
				) : (
					<Link
						href="/auth"
						className="mt-2 flex h-(--h-control) w-full items-center justify-center border border-denim bg-transparent font-mono text-xs uppercase tracking-[0.08em] text-denim-accent transition-[color,background-color,border-color] duration-(--dur-hover) ease-out hover:bg-denim hover:text-on-denim active:bg-denim-tint active:text-denim-accent active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
					>
						Sign In
					</Link>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
