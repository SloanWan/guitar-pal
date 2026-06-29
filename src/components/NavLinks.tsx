"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
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
		<div className="bg-muted rounded-full px-1 py-1 flex gap-1">
			{links.map(({ href, label, Icon }) => {
				const isActive = pathname === href;
				return (
					<Button
						key={href}
						variant="ghost"
						size="sm"
						aria-label={label}
						className={`rounded-full text-sm font-medium px-2 nav:px-4 py-1.5 h-auto transition-all duration-200 ${
							isActive
								? "bg-background text-foreground shadow-sm hover:bg-background"
								: "text-muted-foreground hover:text-foreground hover:bg-transparent"
						}`}
						asChild
					>
						<Link href={href} className="flex items-center gap-2">
							<Icon className="size-4 shrink-0" />
							<span className="hidden nav:inline">{label}</span>
						</Link>
					</Button>
				);
			})}
		</div>
	);
}
