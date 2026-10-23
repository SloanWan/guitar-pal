"use client";

import { usePathname } from "next/navigation";
import { moduleForPath } from "@/lib/moduleForPath";

/** The page's <main>, carrying `data-m` so the --gp-m-* tokens follow the current module. */
export default function ModuleMain({ className, children }: { className?: string; children: React.ReactNode }) {
	const pathname = usePathname();
	return (
		<main className={className} data-m={moduleForPath(pathname)}>
			{children}
		</main>
	);
}
