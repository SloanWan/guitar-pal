"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/AppLink";
import { signInHref } from "@/lib/safeRedirect";

/**
 * The topbar's sign-in CTA. A client component only because the link must
 * know where the visitor is: it carries the current page as `redirect`, so
 * signing in from /strum lands back on /strum rather than on /home. Styling
 * is the caller's — the inline and collapsed-menu variants differ.
 */
export default function SignInLink({ className }: { className: string }) {
	const pathname = usePathname();
	const search = useSearchParams().toString();
	return (
		<Link href={signInHref(pathname, search ? `?${search}` : "")} className={className}>
			Sign In
		</Link>
	);
}
