import type { RunStatus, SubjectStatus } from "@/lib/evals/types";

/** "3 min ago", "2 h ago", "Sep 25". */
export function ago(iso: string | null | undefined, now: number): string {
	if (!iso) return "—";
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return "—";
	const s = Math.max(0, Math.round((now - t) / 1000));
	if (s < 60) return `${s} s ago`;
	if (s < 3600) return `${Math.round(s / 60)} min ago`;
	if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
	return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "4:07" — elapsed or remaining time. */
export function clock(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const rest = String(s % 60).padStart(2, "0");
	return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

const STATUS_STYLE: Record<RunStatus | SubjectStatus, string> = {
	running: "border-gp-tab-500 bg-gp-tab-100 text-gp-tab-500",
	loading: "border-gp-tab-500 bg-gp-tab-100 text-gp-tab-500",
	queued: "border-gp-line text-gp-ink-3",
	done: "border-gp-line text-gp-ink-2",
	failed: "border-gp-bad bg-gp-bad/15 text-gp-bad",
};

/** A run's or a subject's state, as a small pill; running pulses. */
export function StatusPill({ status }: { status: RunStatus | SubjectStatus }) {
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-px font-mono text-[10.5px] uppercase tracking-[0.06em] ${STATUS_STYLE[status]}`}
		>
			{(status === "running" || status === "loading") && (
				<span aria-hidden className="size-1.5 animate-pulse rounded-full bg-gp-tab-500 motion-reduce:animate-none" />
			)}
			{status}
		</span>
	);
}
