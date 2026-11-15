"use client";

// The one place `next/link` may be imported (enforced by the no-restricted-imports
// ESLint rule). Every other module imports this instead, so that every link click
// feeds the global navigation progress bar via useLinkStatus().
//
// useLinkStatus only works inside a Link, so the reporter is rendered as a child
// of Link. It renders no DOM (returns null), so it never affects link layout.
//
// It is also where a page with unsaved work holds a navigation (src/lib/leaveGuard.ts).
// A link that unmounts as it is pressed (in a menu) hands the navigation to a
// `pushWith` router instead, whose transition outlives it.

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { useNavStore, usePublishPending, type NavRouter } from "@/components/nav-progress";
import { mayNavigate } from "@/lib/leaveGuard";

function LinkPending() {
	const { pending } = useLinkStatus();
	usePublishPending(pending);
	return null;
}

export type AppLinkProps = ComponentProps<typeof Link> & {
	/**
	 * For a link inside something that closes as it is pressed (a menu, a sheet):
	 * navigate through this router, from a component that stays mounted, so the
	 * progress bar keeps running after the link itself is gone.
	 */
	pushWith?: NavRouter;
};

const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
	{ children, onNavigate, pushWith, ...props },
	ref,
) {
	const store = useNavStore();
	return (
		<Link
			ref={ref}
			{...props}
			onNavigate={(e) => {
				onNavigate?.(e);
				const href = typeof props.href === "string" ? props.href : (props.href.pathname ?? "/");
				if (!mayNavigate(href)) e.preventDefault();
				else if (pushWith) {
					e.preventDefault();
					pushWith.push(href);
				} else store.aim(href);
			}}
		>
			{children}
			<LinkPending />
		</Link>
	);
});

export default AppLink;
