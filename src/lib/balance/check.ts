import type { BalanceRow, Env, Http, VendorCheck } from "./types";
import { VendorError } from "./types";

/** How long one vendor may take before its row says so; the others never wait on it. */
export const VENDOR_TIMEOUT_MS = 15_000;

/** The credentials a check reads, never shown: every one is cut out of a message before it is printed. */
export function redact(message: string, secrets: readonly string[]): string {
	let out = message;
	for (const secret of secrets) {
		if (secret.length >= 6) out = out.split(secret).join("[redacted]");
	}
	return out;
}

/** The longest an error note may run in the table. */
const MAX_NOTE = 160;

/** One line, cut to fit a table cell. */
export function oneLine(text: string, max = MAX_NOTE): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * The message out of a vendor's error body: `{error: {message}}` or
 * `{error: "…"}` (DeepSeek), `{Code, Message}` (Alibaba Cloud).
 */
export function errorMessage(body: unknown): string | null {
	if (typeof body !== "object" || body === null) return null;
	const b = body as Record<string, unknown>;
	const error = typeof b.error === "object" && b.error !== null ? (b.error as Record<string, unknown>) : null;
	const message = error?.message ?? (typeof b.error === "string" ? b.error : null) ?? b.Message ?? b.message;
	if (typeof message !== "string") return null;
	return typeof b.Code === "string" && b.Code !== "" && !/^\d+$/.test(b.Code) ? `${b.Code}: ${message}` : message;
}

/** The body of a response that must be JSON, or a `VendorError` naming the status and the vendor's message. */
export async function readJson(response: Response): Promise<unknown> {
	const text = await response.text();
	let body: unknown = null;
	try {
		body = JSON.parse(text) as unknown;
	} catch {
		throw new VendorError(oneLine(`not JSON (HTTP ${response.status}): ${text}`));
	}
	if (!response.ok) {
		throw new VendorError(oneLine(`HTTP ${response.status}: ${errorMessage(body) ?? text}`));
	}
	return body;
}

/** A decimal as vendors write it: a number, or a string that may carry thousands separators. */
export function amount(value: unknown): number | undefined {
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "string") return undefined;
	const n = Number(value.replace(/,/g, "").trim());
	return value.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

/** The object at `value`, or a `VendorError` saying what was expected. */
export function record(value: unknown, what: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new VendorError(`expected ${what} to be an object`);
	}
	return value as Record<string, unknown>;
}

function withTimeout(http: Http, ms: number): Http {
	return (url, init) => http(url, { ...init, signal: AbortSignal.timeout(ms) });
}

/** One vendor's rows. A failure is that vendor's error row, never an exception. */
export async function checkVendor(vendor: VendorCheck, env: Env, http: Http): Promise<BalanceRow[]> {
	const base = { vendor: vendor.id, label: vendor.label, console: vendor.console, verified: vendor.verified };
	const missing = vendor.env.filter((name) => !env[name]);
	if (missing.length > 0) {
		const hint = vendor.unsetHint ? ` (${vendor.unsetHint})` : "";
		return [{ ...base, state: "unset", note: `set ${missing.join(", ")} to check${hint}` }];
	}
	const secrets = vendor.env.map((name) => env[name] ?? "");
	try {
		const readings = await vendor.read(env, withTimeout(http, VENDOR_TIMEOUT_MS));
		if (readings.length === 0) return [{ ...base, state: "error", note: "the vendor reported no figures" }];
		return readings.map((r) => ({ ...base, state: "ok" as const, ...r }));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return [{ ...base, state: "error", note: oneLine(redact(message, secrets)) }];
	}
}

/** Every vendor at once, in the list's order. */
export async function checkAll(vendors: readonly VendorCheck[], env: Env, http: Http): Promise<BalanceRow[]> {
	const rows = await Promise.all(vendors.map((v) => checkVendor(v, env, http)));
	return rows.flat();
}

function money(value: number | undefined): string {
	return value === undefined ? "—" : value.toFixed(2);
}

/** The rows as a plain-text table for the terminal. */
export function formatTable(rows: readonly BalanceRow[]): string {
	const header = ["Vendor", "Left", "Currency", "Note"];
	const body = rows.map((r) => [
		r.label,
		r.state === "ok" ? money(r.balance) : "—",
		r.currency ?? "",
		[
			r.state === "error" ? `error: ${r.note ?? ""}` : (r.note ?? ""),
			r.state === "ok" && !r.verified ? "unverified endpoint" : "",
			r.state === "error" ? r.console : "",
		]
			.filter(Boolean)
			.join(" · "),
	]);
	const widths = header.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
	const line = (cells: string[]) =>
		cells
			.map((c, i) => (i === cells.length - 1 ? c : i === 1 ? c.padStart(widths[i]) : c.padEnd(widths[i])))
			.join("  ")
			.trimEnd();
	return [line(header), line(widths.map((w) => "-".repeat(w))), ...body.map(line)].join("\n");
}
