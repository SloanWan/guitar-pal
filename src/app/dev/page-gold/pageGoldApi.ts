import type { Notation, PageGoldDecision, PageGoldRecord, PageGoldSet, PageKind } from "@/lib/pageGold";

/** The review pages' calls to `/api/dev/page-gold`; each throws with the route's own message. */

const BASE = "/api/dev/page-gold";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, { cache: "no-store", ...init });
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(body?.error ?? `${res.status} from ${url}`);
	}
	return (await res.json()) as T;
}

export const fetchPageSets = (): Promise<{ root: string; sets: PageGoldSet[] }> => call(BASE);

export const fetchPage = (set: string, id: string): Promise<PageGoldRecord> =>
	call(`${BASE}/${encodeURIComponent(set)}/${encodeURIComponent(id)}`);

export const putPageReview = (
	set: string,
	id: string,
	review: { decision: PageGoldDecision; kind: PageKind | null; notation: Notation[]; exercises: number | null; note: string },
): Promise<PageGoldRecord> =>
	call(`${BASE}/${encodeURIComponent(set)}/${encodeURIComponent(id)}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(review),
	});

export const pageSrc = (record: Pick<PageGoldRecord, "set" | "image">): string =>
	`${BASE}/${encodeURIComponent(record.set)}/pages/${encodeURIComponent(record.image)}`;

export const pageHref = (set: string, id: string): string => `/dev/page-gold/${set}/${id}`;
