"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, BookText, Ellipsis, Guitar, Music } from "lucide-react";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { Sheet } from "@/components/ui/sheet";
import SignInLink from "@/components/SignInLink";
import { ThemeSwitch } from "@/components/ThemeToggle";
import { useLogout } from "@/components/LogoutButton";
import { LEGAL_DOC_NAMES, LEGAL_DOCS } from "@/lib/docs/legalDocs";
import type { ModuleKey } from "@/lib/moduleForPath";
import { useNavRouter } from "@/components/nav-progress";

const PLACES: readonly { href: string; title: string; subline: string; icon: typeof BookOpen; module: ModuleKey }[] = [
	{ href: "/books", title: "Books", subline: "Your method books, chapter by chapter", icon: BookOpen, module: "books" },
	{ href: "/fretboard", title: "Fretboard", subline: "Notes, intervals and shapes", icon: Guitar, module: "fb" },
	{ href: "/chords?view=mine", title: "My chords", subline: "The shapes you saved", icon: Music, module: "chords" },
	{ href: "/docs", title: "Docs", subline: "Install the app, the assistant, your AI", icon: BookText, module: "home" },
];

const FOOT_LINK =
	"gp-lean gp-focus rounded-gp-xs text-(length:--gp-t-cap) font-medium text-gp-ink-3 transition-colors duration-(--gp-d-state) hover:text-gp-ink";

/**
 * ⋯ More, in the phone app bar: the places the tab bar has no room for, each with its
 * module badge, then the theme, signing in or out, and the legal pages — an installed
 * app has no address bar, so this is the way to them on a phone.
 */
export default function MoreMenu({ signedIn, hideSignIn = false, className }: { signedIn: boolean; hideSignIn?: boolean; className?: string }) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();
	const { logout, loading } = useLogout();
	// The sheet closes as a link is pressed, taking the link with it: navigate from here.
	const router = useNavRouter();
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
						<Link href={p.href} pushWith={router} onClick={() => setOpen(false)} />
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
				<nav aria-label="Legal" className="mt-3 border-t border-gp-line pt-3">
					<ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
						{LEGAL_DOC_NAMES.map((name, i) => (
							<li key={name} className="flex items-center gap-x-2">
								{i > 0 && (
									<span className="text-(length:--gp-t-cap) text-gp-ink-3" aria-hidden>
										·
									</span>
								)}
								<Link href={`/${name}`} pushWith={router} onClick={() => setOpen(false)} className={FOOT_LINK}>
									<span className="gp-title">{LEGAL_DOCS[name].en.label}</span>
								</Link>
							</li>
						))}
					</ul>
				</nav>
			</div>
		</Sheet>
	);
}
