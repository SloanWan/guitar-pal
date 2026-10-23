"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Ellipsis, Guitar, Music } from "lucide-react";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { Sheet } from "@/components/ui/sheet";
import SignInLink from "@/components/SignInLink";
import { ThemeSwitch } from "@/components/ThemeToggle";
import { useLogout } from "@/components/LogoutButton";
import type { ModuleKey } from "@/lib/moduleForPath";

const PLACES: readonly { href: string; title: string; subline: string; icon: typeof BookOpen; module: ModuleKey }[] = [
	{ href: "/books", title: "Books", subline: "Your method books, chapter by chapter", icon: BookOpen, module: "books" },
	{ href: "/fretboard", title: "Fretboard", subline: "Notes, intervals and shapes", icon: Guitar, module: "fb" },
	{ href: "/chords/my", title: "My chords", subline: "The shapes you saved", icon: Music, module: "chords" },
];

/**
 * ⋯ More, in the phone app bar: the places the tab bar has no room for, each with its
 * module badge, then the theme and signing in or out.
 */
export default function MoreMenu({ signedIn, hideSignIn = false, className }: { signedIn: boolean; hideSignIn?: boolean; className?: string }) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();
	const { logout, loading } = useLogout();
	return (
		<Sheet
			open={open}
			onOpenChange={setOpen}
			title="More"
			trigger={
				<Button variant="icon" size="sm" aria-label="More" className={className}>
					<Ellipsis aria-hidden />
				</Button>
			}
		>
			<div className="grid gap-2">
				{PLACES.map((p) => (
					<ListRow
						key={p.href}
						asChild
						title={p.title}
						subline={p.subline}
						icon={p.icon}
						module={p.module}
						selected={pathname === p.href || pathname.startsWith(`${p.href}/`)}
					>
						<Link href={p.href} onClick={() => setOpen(false)} />
					</ListRow>
				))}
			</div>
			<div className="gp-more-foot">
				<ThemeSwitch />
				{signedIn ? (
					<Button variant="secondary" className="mt-2" loading={loading} onClick={() => void logout()}>
						Sign out
					</Button>
				) : hideSignIn ? null : (
					<Button variant="ink" asChild className="mt-2">
						<SignInLink onClick={() => setOpen(false)}>Sign in</SignInLink>
					</Button>
				)}
			</div>
		</Sheet>
	);
}
