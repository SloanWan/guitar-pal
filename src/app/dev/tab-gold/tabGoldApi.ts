import type { TabGoldRecord, TabGoldReview, TabGoldSet } from "@/lib/tabGold";

/** The review pages' calls to `/api/dev/tab-gold`; each throws with the route's own message. */

const BASE = "/api/dev/tab-gold";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, { cache: "no-store", ...init });
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(body?.error ?? `${res.status} from ${url}`);
	}
	return (await res.json()) as T;
}

export const fetchSets = (): Promise<{ root: string; sets: TabGoldSet[] }> => call(BASE);

export const fetchRecord = (set: string, id: string): Promise<TabGoldRecord> =>
	call(`${BASE}/${encodeURIComponent(set)}/${encodeURIComponent(id)}`);

export const putReview = (set: string, id: string, review: TabGoldReview): Promise<TabGoldRecord> =>
	call(`${BASE}/${encodeURIComponent(set)}/${encodeURIComponent(id)}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(review),
	});

export const cropSrc = (record: Pick<TabGoldRecord, "set" | "crop">): string =>
	`${BASE}/${encodeURIComponent(record.set)}/crops/${encodeURIComponent(record.crop)}`;

export const reviewHref = (set: string, id: string): string => `/dev/tab-gold/${set}/${id}`;
