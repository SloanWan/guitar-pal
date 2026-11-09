import type { VitalName } from "./events";

/** How the monitor writes its numbers (#458). */

/** A vital as it is read: CLS unitless to two places, the rest in ms, or seconds from one. */
export function formatVital(name: VitalName, value: number | null): string {
	if (value === null) return "—";
	if (name === "CLS") return value.toFixed(2);
	if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
	return `${Math.round(value)} ms`;
}

/** Errors per page load: a percentage, one place under 10 %. */
export function formatRate(rate: number | null): string {
	if (rate === null) return "—";
	const percent = rate * 100;
	return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}

/** `11-08 18:49` in the dashboard's time zone. */
export function formatWhen(iso: string, timeZone: string): string {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-CA", { timeZone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
			.formatToParts(new Date(iso))
			.map((p) => [p.type, p.value]),
	);
	return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/** A bucket's axis label: `11-08` for a day, `14:00` for an hour. */
export function formatBucket(key: string): string {
	const [day, hour] = key.split(" ");
	return hour === undefined ? day.slice(5) : `${hour}:00`;
}
