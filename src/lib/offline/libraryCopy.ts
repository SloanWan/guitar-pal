/**
 * A copy of the signed-in player's library on this device (#469), so it can be
 * read offline.
 *
 * Every library read goes through `readThrough`: the account first, its answer
 * kept; the kept copy when the read fails, or straight away when the browser
 * knows it is offline (a request then only fails, and is reported as a
 * Supabase failure on the way). This is the one seam between the pages and
 * where a library lives — when the Java service takes the user tables over,
 * only the `remote` functions change.
 *
 * Copies are reading only: nothing written offline is kept here to be sent
 * later (#470). They are keyed by user id, so another account never sees them,
 * and an account's copies go when it signs out (`OfflineSupport`).
 */

export type Library =
	| "strumPatterns"
	| "strumFavourites"
	| "progressions"
	| "fingerpickPatterns"
	| "fingerpickFavourites"
	| "favouriteChords"
	| "chordVoicings";

/** Where copies are kept: IndexedDB in a browser, a Map in tests and wherever IndexedDB is missing. */
export interface CopyStore {
	get(key: string): Promise<unknown>;
	put(key: string, value: unknown): Promise<void>;
	/** Every copy of one account. */
	deleteAccount(userId: string): Promise<void>;
}

interface StoredCopy {
	savedAt: number;
	value: unknown;
}

function isStoredCopy(value: unknown): value is StoredCopy {
	return typeof value === "object" && value !== null && "savedAt" in value && "value" in value;
}

export function copyKey(userId: string, library: Library): string {
	return `${userId}/${library}`;
}

export function memoryStore(): CopyStore {
	const copies = new Map<string, unknown>();
	return {
		get: async (key) => copies.get(key),
		put: async (key, value) => {
			copies.set(key, value);
		},
		deleteAccount: async (userId) => {
			for (const key of [...copies.keys()]) if (key.startsWith(`${userId}/`)) copies.delete(key);
		},
	};
}

const DB_NAME = "guitarpal-offline";
const STORE_NAME = "copies";

function done<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export function indexedDbStore(factory: IDBFactory): CopyStore {
	let db: Promise<IDBDatabase> | null = null;
	const open = () => {
		db ??= new Promise<IDBDatabase>((resolve, reject) => {
			const request = factory.open(DB_NAME, 1);
			request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		}).catch((error: unknown) => {
			// Refused (a private window, say): the next read tries again.
			db = null;
			throw error;
		});
		return db;
	};
	const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE_NAME, mode).objectStore(STORE_NAME);
	return {
		get: async (key) => done((await store("readonly")).get(key)),
		put: async (key, value) => {
			await done((await store("readwrite")).put(value, key));
		},
		deleteAccount: async (userId) => {
			await done((await store("readwrite")).delete(IDBKeyRange.bound(`${userId}/`, `${userId}/￿`)));
		},
	};
}

let defaultStore: CopyStore | null = null;

/** The store the app uses. */
export function copyStore(): CopyStore {
	defaultStore ??= typeof indexedDB === "undefined" ? memoryStore() : indexedDbStore(indexedDB);
	return defaultStore;
}

function browserOnline(): boolean {
	return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function readCopy(store: CopyStore, key: string): Promise<{ value: unknown } | null> {
	try {
		const stored = await store.get(key);
		return isStoredCopy(stored) ? { value: stored.value } : null;
	} catch {
		return null;
	}
}

/** Keeps a library's latest state. Never fails: a copy that cannot be written only means a stale copy. */
export async function saveCopy(library: Library, userId: string, value: unknown, store: CopyStore = copyStore()): Promise<void> {
	const record: StoredCopy = { savedAt: Date.now(), value };
	await store.put(copyKey(userId, library), record).catch(() => undefined);
}

/**
 * How long a read may take when there is a copy to show instead. A connection
 * that is up but carries nothing (common enough reaching Supabase from some
 * networks) never fails a read; it only leaves a library loading.
 */
export const READ_TIMEOUT_MS = 8000;

export interface ReadOptions {
	store?: CopyStore;
	/** Whether the browser believes it is online; read from `navigator` by default. */
	online?: boolean;
	timeoutMs?: number;
}

/** The read, or a rejection once `ms` have passed; the timer goes either way. */
function within<T>(read: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error("read timed out")), ms);
	});
	return Promise.race([read, late]).finally(() => clearTimeout(timer));
}

/**
 * A library read: the account's answer, kept for later; else the kept copy —
 * when the read fails, when it takes longer than `timeoutMs`, or straight away
 * offline. A read with no copy behind it is waited for and fails as it would
 * have without one. A read the copy stood in for still keeps its answer when
 * it comes, for the next load.
 *
 * The copy is the value a `remote` call of this same library returned, so it
 * comes back as `T`.
 */
export async function readThrough<T>(
	library: Library,
	userId: string,
	remote: () => Promise<T>,
	{ store = copyStore(), online = browserOnline(), timeoutMs = READ_TIMEOUT_MS }: ReadOptions = {},
): Promise<T> {
	const key = copyKey(userId, library);
	const kept = await readCopy(store, key);
	if (!online && kept) return kept.value as T;
	const read = remote().then(async (value) => {
		await saveCopy(library, userId, value, store);
		return value;
	});
	if (!kept) return read;
	try {
		return await within(read, timeoutMs);
	} catch {
		// A server error as much as a lost connection: a library to read beats an empty one.
		read.catch(() => undefined);
		return kept.value as T;
	}
}

/** Deletes every copy of one account; on a sign-out. */
export async function forgetAccountCopies(userId: string, store: CopyStore = copyStore()): Promise<void> {
	await store.deleteAccount(userId).catch(() => undefined);
}
