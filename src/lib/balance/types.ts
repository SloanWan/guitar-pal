/**
 * `npm run balance` (#430): what is left on each model vendor's account, in
 * one table. Each vendor is a `VendorCheck`; its `read`
 * turns the vendor's own answer into `Reading`s and nothing else knows its
 * shape.
 */

/** The environment as the runner was given it (`.env.local` merged into `process.env`). */
export type Env = Readonly<Record<string, string | undefined>>;

/** The one network call a vendor makes; `fetch` in the runner, a fake in the tests. */
export type Http = (url: string, init?: RequestInit) => Promise<Response>;

/** One currency's figures from one vendor. */
export interface Reading {
	/** What is left to spend, in `currency`. */
	balance?: number;
	currency: string;
	note?: string;
}

export interface VendorCheck {
	id: string;
	label: string;
	/** Every variable the check needs; a row says "set …" when one is missing. */
	env: readonly string[];
	/** Said after "set … to check": what the variables are, when a vendor's other keys are easy to mistake for them. */
	unsetHint?: string;
	/** Where the figures are on the vendor's site. */
	console: string;
	/**
	 * Whether `read` has been checked against a real account. An unverified
	 * read still runs; its row says so, and its figures are not to be trusted
	 * until it has been.
	 */
	verified: boolean;
	read: (env: Env, http: Http) => Promise<Reading[]>;
}

export type RowState = "ok" | "unset" | "error";

export interface BalanceRow {
	vendor: string;
	label: string;
	state: RowState;
	balance?: number;
	currency?: string;
	note?: string;
	console: string;
	verified: boolean;
}

/** A vendor answered outside what its adapter expects. */
export class VendorError extends Error {}
