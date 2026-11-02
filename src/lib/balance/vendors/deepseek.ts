import { amount, readJson, record } from "../check";
import type { Reading, VendorCheck } from "../types";
import { VendorError } from "../types";

/**
 * `{ is_available, balance_infos: [{ currency, total_balance, granted_balance,
 * topped_up_balance }] }`, amounts as strings. A currency with nothing in it
 * is left out, unless every one is empty.
 */
export function parseDeepSeek(body: unknown): Reading[] {
	const infos = record(body, "the balance").balance_infos;
	if (!Array.isArray(infos)) throw new VendorError("expected balance_infos to be a list");
	const readings = infos.map((raw) => {
		const info = record(raw, "a balance");
		const granted = amount(info.granted_balance) ?? 0;
		return {
			currency: String(info.currency ?? "?"),
			balance: amount(info.total_balance),
			...(granted > 0 ? { note: `${granted.toFixed(2)} of it granted` } : {}),
		};
	});
	const held = readings.filter((r) => (r.balance ?? 0) > 0);
	return held.length > 0 ? held : readings.slice(0, 1);
}

export const deepseek: VendorCheck = {
	id: "deepseek",
	label: "DeepSeek",
	env: ["DEEPSEEK_API_KEY"],
	console: "https://platform.deepseek.com/usage",
	verified: true,
	async read(env, http) {
		const response = await http("https://api.deepseek.com/user/balance", {
			headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, Accept: "application/json" },
		});
		return parseDeepSeek(await readJson(response));
	},
};
