"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { forgetAccountCopies } from "@/lib/offline/libraryCopy";
import { forgetRememberedUser } from "@/lib/offline/rememberedUser";
import { accountChanged, accountToRecord, CACHED_ACCOUNT_KEY, forgetKeptPages, serviceWorkerUrl } from "@/lib/pwa/offline";

const OFFLINE_TOAST = "offline";

/** Whether the last account seen here is signed in; what the auth listener below records. */
function signedInHere(): boolean {
	try {
		return Boolean(localStorage.getItem(CACHED_ACCOUNT_KEY));
	} catch {
		return false;
	}
}

/**
 * Offline use (#468, #469): registers the service worker, empties its kept
 * pages and the library copies of the account left when the account changes,
 * and says so while the browser is offline.
 *
 * The worker runs in production builds only. In development it would keep
 * serving build files a rebuild has changed, so a worker left over from a
 * local `next start` is removed instead.
 */
export default function OfflineSupport() {
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		const container = navigator.serviceWorker;
		if (process.env.NODE_ENV !== "production") {
			container.getRegistrations().then((registrations) => registrations.forEach((r) => r.unregister()));
			return;
		}
		let cancelled = false;
		container
			.register(serviceWorkerUrl(process.env.NEXT_PUBLIC_SW_VERSION ?? "local"), { scope: "/", updateViaCache: "none" })
			.then(() => container.ready)
			// The tool pages are fetched once the worker runs; it skips the ones it already has.
			.then((registration) => {
				if (!cancelled) registration.active?.postMessage("warm");
			})
			// A browser that refuses workers (a private window, say) just has no offline use.
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const {
			data: { subscription },
		} = createClient().auth.onAuthStateChange((event, session) => {
			const current = session?.user.id ?? null;
			let recorded: string | null = null;
			try {
				recorded = localStorage.getItem(CACHED_ACCOUNT_KEY);
				const next = accountToRecord(recorded, event, current);
				if (next !== null) localStorage.setItem(CACHED_ACCOUNT_KEY, next);
			} catch {
				// No storage: nothing recorded, so the pages are forgotten on every account seen — the safe side.
			}
			if (accountChanged(recorded, event, current)) {
				if ("caches" in window) forgetKeptPages(caches).catch(() => undefined);
				// The library copies are per account already; the one signed out of has no business staying (#469).
				if (recorded) void forgetAccountCopies(recorded);
			}
			if (event === "SIGNED_OUT") forgetRememberedUser();
		});
		return () => subscription.unsubscribe();
	}, []);

	useEffect(() => {
		// A disabled button shows no title, so this line is where a signed-in
		// player learns why their library cannot be changed (#469).
		const show = () =>
			toast(
				signedInHere()
					? "You're offline. Your library is read-only until you're back; the sounds still play."
					: "You're offline. Pages opened on this device and the sounds still work.",
				{ id: OFFLINE_TOAST, duration: Infinity },
			);
		const hide = () => toast.dismiss(OFFLINE_TOAST);
		if (!navigator.onLine) show();
		window.addEventListener("offline", show);
		window.addEventListener("online", hide);
		return () => {
			window.removeEventListener("offline", show);
			window.removeEventListener("online", hide);
		};
	}, []);

	return null;
}
