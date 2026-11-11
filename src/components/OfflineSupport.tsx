"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { accountChanged, CACHED_ACCOUNT_KEY, forgetKeptPages, serviceWorkerUrl } from "@/lib/pwa/offline";

const OFFLINE_TOAST = "offline";

/**
 * Offline use (#468): registers the service worker, empties its kept pages
 * when the account changes, and says so while the browser is offline.
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
		if (!("caches" in window)) return;
		const {
			data: { subscription },
		} = createClient().auth.onAuthStateChange((_event, session) => {
			const current = session?.user.id ?? null;
			let recorded: string | null = null;
			try {
				recorded = localStorage.getItem(CACHED_ACCOUNT_KEY);
				localStorage.setItem(CACHED_ACCOUNT_KEY, current ?? "");
			} catch {
				// No storage: nothing recorded, so the pages are forgotten every time — the safe side.
			}
			if (accountChanged(recorded, current)) forgetKeptPages(caches).catch(() => undefined);
		});
		return () => subscription.unsubscribe();
	}, []);

	useEffect(() => {
		const show = () =>
			toast("You're offline. Pages opened on this device and the sounds still work.", {
				id: OFFLINE_TOAST,
				duration: Infinity,
			});
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
