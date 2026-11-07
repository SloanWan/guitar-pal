import { reportError } from "@/lib/telemetry/client";

// Runs before the app is interactive (#447): what nothing else catches — an
// error thrown outside React, a promise nobody awaited — is reported. Errors
// React catches reach the route's error screen, which reports them itself.
try {
	window.addEventListener("error", (event) => {
		// A resource that failed to load fires here too, with no error attached.
		if (event.error === undefined && !event.message) return;
		reportError(event.error ?? event.message, "window");
	});
	window.addEventListener("unhandledrejection", (event) => {
		reportError(event.reason, "rejection");
	});
} catch {
	// Instrumentation must never stop the app from starting.
}
