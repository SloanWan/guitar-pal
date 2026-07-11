"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Music, Rows4, Hand } from "lucide-react";

const links = [
	{ href: "/chords", label: "Chords Library", Icon: Music },
	{ href: "/strum", label: "Strumming Playground", Icon: Rows4 },
	{ href: "/fingerpick", label: "Fingerpicking", Icon: Hand },
];

export default function NavLinks() {
	const pathname = usePathname();

	return (
		<nav className="flex gap-0.5">
			{links.map(({ href, label, Icon }) => {
				const isActive = pathname === href;
				return (
					<Link
						key={href}
						href={href}
						aria-label={label}
						aria-current={isActive ? "page" : undefined}
						className={`flex items-center gap-2 border px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 nav:px-3 ${
							isActive
								? "border-line-strong bg-raise text-denim-accent"
								: "border-transparent text-ink-dim hover:text-ink"
						}`}
					>
						<Icon
							className="size-4 shrink-0"
							strokeWidth={1.5}
							strokeLinecap="square"
						/>
						<span className="hidden nav:inline">{label}</span>
					</Link>
				);
			})}
		</nav>
	);
}
