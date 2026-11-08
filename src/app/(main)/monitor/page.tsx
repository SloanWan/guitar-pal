import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MonitorDashboard from "@/components/monitor/MonitorDashboard";
import { createSupabaseServer } from "@/lib/supabase-server";
import { canViewMonitor } from "@/lib/telemetry/monitorAccess";
import { MONITOR_TIME_ZONE, monitorView } from "@/lib/telemetry/monitorView";
import { readEvents, telemetryClient } from "@/lib/telemetry/store";
import { summarize } from "@/lib/telemetry/summary";

/**
 * The monitor (#458): only the accounts in `MONITOR_USER_IDS` may open it.
 * Anyone else, signed in or not, gets the site's 404, so the page does not say
 * it exists. Rows are read with the service role: the table grants nothing to a
 * browser.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Monitor | Guitar Pal",
	robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ range?: string | string[]; viewport?: string | string[] }> };

export default async function MonitorPage({ searchParams }: Props) {
	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!canViewMonitor(user?.id)) notFound();

	const client = telemetryClient();
	if (!client) throw new Error("The monitor needs SUPABASE_SERVICE_ROLE_KEY on the server.");
	const view = monitorView(await searchParams);
	const { events, truncated } = await readEvents(client, view.from);
	const summary = summarize(events, { from: view.from, to: view.to, bucket: view.bucket, viewport: view.screen, timeZone: MONITOR_TIME_ZONE });
	return <MonitorDashboard summary={summary} view={view} truncated={truncated} />;
}
