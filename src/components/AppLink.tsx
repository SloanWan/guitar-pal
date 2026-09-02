"use client";

// The one place `next/link` may be imported (enforced by the no-restricted-imports
// ESLint rule). Every other module imports this instead, so that every link click
// feeds the global navigation progress bar via useLinkStatus().
//
// useLinkStatus only works inside a Link, so the reporter is rendered as a child
// of Link. It renders no DOM (returns null), so it never affects link layout.

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { usePublishPending } from "@/components/nav-progress";

function LinkPending() {
	const { pending } = useLinkStatus();
	usePublishPending(pending);
	return null;
}

export type AppLinkProps = ComponentProps<typeof Link>;

const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
	{ children, ...props },
	ref,
) {
	return (
		<Link ref={ref} {...props}>
			{children}
			<LinkPending />
		</Link>
	);
});

export default AppLink;
