import { createClient } from "@/lib/supabase";

// Max query length accepted — mirrors the char_length(query) <= 100 DB check so we
// fail fast client-side instead of on a round-trip.
export const MAX_QUERY_LENGTH = 100;

// Minimum gap between two successful reports (ms). Blunts accidental double-submits
// and rapid spam without a server round-trip.
export const REPORT_THROTTLE_MS = 2000;

export type SubmissionVerdict = "ok" | "empty" | "duplicate" | "throttled";

export interface ThrottleState {
  // Normalized queries already reported this session — dedupe key set.
  readonly submitted: Set<string>;
  // Timestamp (ms) of the last accepted submission.
  lastSubmitAt: number;
}

export function createThrottleState(): ThrottleState {
  // -Infinity so the first submission is never throttled, whatever the clock reads.
  return { submitted: new Set<string>(), lastSubmitAt: Number.NEGATIVE_INFINITY };
}

// Pure decision for whether a report should be sent. Trimmed+capped `cleaned` is the
// value to persist; `key` is its dedupe identity. Does NOT mutate state — the caller
// commits (adds the key / advances lastSubmitAt) only on a successful insert, so a
// failed insert can be retried.
export function evaluateSubmission(
  query: string,
  now: number,
  state: ThrottleState,
  throttleMs: number = REPORT_THROTTLE_MS,
): { verdict: SubmissionVerdict; cleaned: string; key: string } {
  const cleaned = query.trim().slice(0, MAX_QUERY_LENGTH);
  const key = cleaned.toLowerCase();
  if (cleaned === "") return { verdict: "empty", cleaned, key };
  if (state.submitted.has(key)) return { verdict: "duplicate", cleaned, key };
  if (now - state.lastSubmitAt < throttleMs) return { verdict: "throttled", cleaned, key };
  return { verdict: "ok", cleaned, key };
}

// Module-level state so dedupe/throttle survive component remounts within a session.
const moduleState = createThrottleState();

// Persists a missing-chord report. Returns the verdict; only "ok" hits the network.
// Throws if the DB insert itself fails (surface it to the user).
export async function reportChordRequest(query: string): Promise<SubmissionVerdict> {
  const now = Date.now();
  const { verdict, cleaned, key } = evaluateSubmission(query, now, moduleState);
  if (verdict !== "ok") return verdict;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("chord_requests")
    .insert({ query: cleaned, user_id: user?.id ?? null });
  if (error) throw new Error(error.message);

  // Commit dedupe/throttle state only after a successful write.
  moduleState.submitted.add(key);
  moduleState.lastSubmitAt = now;
  return "ok";
}
