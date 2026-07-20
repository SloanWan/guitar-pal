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
		<nav className="flex divide-x divide-line-strong border border-line-strong">
			{links.map(({ href, label, Icon }) => {
				const isActive = pathname === href || pathname.startsWith(`${href}/`);
				/* Latched = pressed-in: recessed via bg color difference only
				   (no inset shadow), content statically sunk 1px. */
				const sink = isActive ? "translate-y-px" : "";
				return (
					<Link
						key={href}
						href={href}
						aria-label={label}
						aria-current={isActive ? "page" : undefined}
						className={`flex h-(--h-control) min-w-(--h-control) items-center justify-center gap-2 whitespace-nowrap px-2 font-mono text-[11px] uppercase tracking-[0.08em] transition-[color,background-color,border-color,transform,translate] duration-(--dur-hover) ease-out focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 motion-safe:active:translate-y-px active:bg-denim-tint active:duration-(--dur-switch) nav:min-w-0 nav:justify-start nav:px-3 ${
							isActive
								? "bg-surface font-medium text-denim-accent"
								: "text-ink hover:text-denim-accent"
						}`}
					>
						<Icon
							className={`size-4 shrink-0 ${sink}`}
							strokeWidth={1.5}
							strokeLinecap="square"
						/>
						{/* LED exists only alongside the text label; in icon-only
						    mode the latch state alone carries the active semantic. */}
						<span
							className={`hidden size-1.5 rounded-full transition-[background,box-shadow] duration-200 nav:inline-block ${
								isActive ? "bg-denim-accent shadow-(--glow-led)" : "bg-ink-faint"
							}`}
							aria-hidden="true"
						/>
						<span className={`hidden nav:inline ${sink}`}>{label}</span>
					</Link>
				);
			})}
		</nav>
	);
}
