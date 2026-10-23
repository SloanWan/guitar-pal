"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "@/components/AppLink";
import type { Profile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import UserAvatar from "./UserAvatar";
import UserIdentity from "./UserIdentity";
import { useLogout } from "./LogoutButton";
import { ThemeSwitch } from "./ThemeToggle";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ITEM = "flex h-10 cursor-pointer items-center gap-2.5 rounded-gp-sm px-2.5 font-gp-body text-[14px] font-medium text-gp-ink focus:bg-gp-well [&_svg]:size-[18px] [&_svg]:text-gp-ink-2";

/**
 * The signed-in account control, rightmost in the header from 720px (a phone has the Me
 * tab instead): the avatar is the trigger, and the menu carries the identity, Settings,
 * the theme switch and sign-out.
 */
export default function UserMenu({ profile, className }: { profile: Profile; className?: string }) {
	const { logout, loading } = useLogout();
	return (
		// Non-modal on purpose. Modal mode sets `pointer-events: none` on <body>
		// while open, so the closing click of a double-click never reaches the
		// trigger — it lands on <html>, and a double-click on the document
		// selects the nearest text on the page. Without the lock the second click
		// hits the button, where text is not selectable to begin with.
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger aria-label={`Account: ${profile.displayName}`} className={cn("gp-avatar-btn", className)}>
				<UserAvatar profile={profile} />
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align="end"
				sideOffset={10}
				className="w-64 rounded-gp-lg border-0 bg-gp-sheet p-1.5 text-gp-ink shadow-[var(--gp-shadow-pop)]"
			>
				<div className="px-2.5 py-2">
					<UserIdentity profile={profile} />
				</div>

				<DropdownMenuSeparator className="mx-1 bg-gp-line" />

				{/* Classes go on the item, not the link: the item runs them through
				    tailwind-merge against its defaults, while asChild's Slot would only
				    concatenate a className set on the Link. */}
				<DropdownMenuItem asChild className={ITEM}>
					<Link href="/settings">
						<Settings aria-hidden />
						Settings
					</Link>
				</DropdownMenuItem>

				{/* A control row, not a menu item: the switch flips without dismissing the menu. */}
				<div className="px-2.5">
					<ThemeSwitch />
				</div>

				<DropdownMenuSeparator className="mx-1 bg-gp-line" />

				<DropdownMenuItem className={ITEM} disabled={loading} onSelect={() => void logout()}>
					<LogOut aria-hidden />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
