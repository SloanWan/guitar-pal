/**
 * Sliding-window rate limiter for the assistant route.
 *
 * Deliberately in-process: a Vercel deployment runs several instances, so the
 * effective ceiling is this limit times the instance count, not the limit. That
 * is acceptable only because the route also requires a signed-in user, which is
 * the real abuse control — an unauthenticated public LLM endpoint is how a
 * hobby project ends up with a four-figure bill. Move this to Redis or a
 * Supabase table before relaxing the auth requirement.
 */

export interface RateLimitConfig {
	/** Requests allowed inside one window. */
	limit: number;
	windowMs: number;
}

export interface RateLimitVerdict {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

export class SlidingWindowLimiter {
	private readonly hits = new Map<string, number[]>();

	constructor(private readonly config: RateLimitConfig) {}

	/**
	 * Records an attempt and says whether it may proceed. `now` is injectable so
	 * the window behaviour is testable without waiting on a real clock.
	 */
	check(key: string, now: number = Date.now()): RateLimitVerdict {
		const cutoff = now - this.config.windowMs;
		this.prune(cutoff);

		const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

		if (recent.length >= this.config.limit) {
			const oldest = recent[0];
			this.hits.set(key, recent);
			return {
				allowed: false,
				remaining: 0,
				retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.config.windowMs - now) / 1000)),
			};
		}

		recent.push(now);
		this.hits.set(key, recent);
		return {
			allowed: true,
			remaining: this.config.limit - recent.length,
			retryAfterSeconds: 0,
		};
	}

	/** Drops keys with no live hits, so an idle process does not grow unbounded. */
	private prune(cutoff: number): void {
		for (const [key, times] of this.hits) {
			const live = times.filter((t) => t > cutoff);
			if (live.length === 0) this.hits.delete(key);
			else if (live.length !== times.length) this.hits.set(key, live);
		}
	}

	/** Test seam. */
	get size(): number {
		return this.hits.size;
	}
}
