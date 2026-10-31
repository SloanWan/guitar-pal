"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link, { type AppLinkProps } from "@/components/AppLink";
import { signInHref } from "@/lib/safeRedirect";

/**
 * The topbar's sign-in CTA. A client component only because the link must
 * know where the visitor is: it carries the current page as `redirect`, so
 * signing in from /strum lands back on /strum rather than on /home. Styling
 * is the caller's; the rest of the props pass through, so a Button can wear it
 * with `asChild`.
 */
export default function SignInLink({ className, children, ...props }: Omit<AppLinkProps, "href">) {
	const pathname = usePathname();
	const search = useSearchParams().toString();
	return (
		<Link href={signInHref(pathname, search ? `?${search}` : "")} className={className} {...props}>
			{children ?? "Sign In"}
		</Link>
	);
}
