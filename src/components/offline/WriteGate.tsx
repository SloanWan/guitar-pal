"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useOnline } from "@/hooks/useOnline";
import { OFFLINE_WRITE_REASON } from "@/lib/offline/writes";

/**
 * Whether the page's writes go to an account, so that offline they are
 * disabled with the reason (#469). The page that knows the player provides
 * it; a control asks `useWriteGate`. Without a provider nothing is blocked.
 */
const SignedInContext = createContext(false);

export function WriteGateProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
	return <SignedInContext.Provider value={signedIn}>{children}</SignedInContext.Provider>;
}

export interface WriteGate {
	blocked: boolean;
	/** Set while blocked: the control's `title`, and what a screen reader hears. */
	reason: string | undefined;
}

/** The gate for a write to the player's library: closed only when signed in and offline. */
export function useWriteGate(): WriteGate {
	const signedIn = useContext(SignedInContext);
	const online = useOnline();
	const blocked = signedIn && !online;
	return { blocked, reason: blocked ? OFFLINE_WRITE_REASON : undefined };
}

/** The gate for a share: a share link is written on the server, so offline it is closed for everyone. */
export function useShareGate(): WriteGate {
	const online = useOnline();
	return { blocked: !online, reason: online ? undefined : "You're offline. Sharing needs a connection." };
}
