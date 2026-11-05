import type { CropGoldBatch, CropGoldRecord, CropGoldReview } from "@/lib/cropGold";

/** The crop review's calls to `/api/dev/crop-gold`; each throws with the route's own message. */

const BASE = "/api/dev/crop-gold";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, { cache: "no-store", ...init });
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(body?.error ?? `${res.status} from ${url}`);
	}
	return (await res.json()) as T;
}

const at = (batch: string, id: string): string => `${BASE}/${encodeURIComponent(batch)}/${encodeURIComponent(id)}`;

export const fetchBatches = (): Promise<{ root: string; batches: CropGoldBatch[] }> => call(BASE);

export const fetchPage = (batch: string, id: string): Promise<CropGoldRecord> => call(at(batch, id));

export const putPageReview = (batch: string, id: string, review: CropGoldReview): Promise<CropGoldRecord> =>
	call(at(batch, id), {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(review),
	});

export const pageImageSrc = (batch: string, id: string): string => `${at(batch, id)}/image`;

export const pageHref = (batch: string, id: string): string => `/dev/crop-gold/${batch}/${id}`;
