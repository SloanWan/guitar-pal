"use client";

import { useReportWebVitals } from "next/web-vitals";
import { reportVital } from "@/lib/telemetry/client";

/**
 * A real visit's LCP, INP, CLS, FCP and TTFB (#447), handed to the reporter.
 * `reportVital` is one stable function, so Next never replays the metrics to a
 * new callback; the reporter keeps each metric's latest value and sends them
 * when the page is hidden.
 */
export default function WebVitals() {
	useReportWebVitals(reportVital);
	return null;
}
