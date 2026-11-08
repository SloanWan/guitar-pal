"use client";

import type { ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";
import { useNavRouter } from "@/components/nav-progress";
import { monitorHref, type MonitorRange, type MonitorViewport } from "@/lib/telemetry/monitorView";

const RANGES = [
	{ value: "24h", label: "24 hours" },
	{ value: "7d", label: "7 days" },
	{ value: "30d", label: "30 days" },
] as const satisfies readonly { value: MonitorRange; label: string }[];

const VIEWPORTS = [
	{ value: "all", label: "All screens" },
	{ value: "phone", label: "Phone" },
	{ value: "desktop", label: "Desktop" },
] as const satisfies readonly { value: MonitorViewport; label: string }[];

/**
 * The range and the screen class, one row above everything they scope (#458).
 * A change is a new query, rendered on the server; while it is on its way the
 * body below keeps its frame, dimmed.
 */
export default function MonitorFilters({ range, viewport, children }: { range: MonitorRange; viewport: MonitorViewport; children: ReactNode }) {
	const router = useNavRouter();
	const go = (next: { range: MonitorRange; viewport: MonitorViewport }) => router.replace(monitorHref(next), { scroll: false });
	return (
		<>
			<div className="mon-filters">
				<Segmented label="Range" options={RANGES} value={range} onChange={(next) => go({ range: next, viewport })} dense />
				<Segmented label="Screen" options={VIEWPORTS} value={viewport} onChange={(next) => go({ range, viewport: next })} dense />
			</div>
			<div className="mon-body" data-pending={router.pending ? "" : undefined}>
				{children}
			</div>
		</>
	);
}
