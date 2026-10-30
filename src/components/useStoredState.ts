import { useEffect, useState } from "react";

/** How a value is written to storage and read back; `parse` returns null for a value it does not accept. */
export interface StoredCodec<T> {
	parse: (raw: string) => T | null;
	format: (value: T) => string;
}

/** A switch, stored as "1" / "0". */
export const FLAG_CODEC: StoredCodec<boolean> = {
	parse: (raw) => (raw === "1" ? true : raw === "0" ? false : null),
	format: (on) => (on ? "1" : "0"),
};

/**
 * A device-local preference: `fallback` on the server and the first render, then
 * what this browser stored, read once after mount. Setting it stores it. Storage
 * that cannot be read or written leaves the value working for this visit only.
 */
export function useStoredState<T>(key: string, fallback: T, codec: StoredCodec<T>): [T, (value: T) => void] {
	const [value, setValue] = useState(fallback);

	useEffect(() => {
		let stored: T | null = null;
		try {
			const raw = localStorage.getItem(key);
			if (raw !== null) stored = codec.parse(raw);
		} catch {
			// unreadable storage: the fallback it is
		}
		// Deferred: a one-shot sync after mount, not a state change inside the effect's render.
		if (stored !== null) queueMicrotask(() => setValue(stored));
		// The codec is a constant at every call site; only the key names what is read.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	function set(next: T) {
		setValue(next);
		try {
			localStorage.setItem(key, codec.format(next));
		} catch {
			// remembered for this visit only
		}
	}

	return [value, set];
}
