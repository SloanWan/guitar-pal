import { describe, it, expect } from "vitest";
import {
  evaluateSubmission,
  createThrottleState,
  MAX_QUERY_LENGTH,
  REPORT_THROTTLE_MS,
} from "@/lib/chordRequests";

describe("evaluateSubmission", () => {
  it("accepts a fresh query", () => {
    const r = evaluateSubmission("Cmaj7zz", 1000, createThrottleState());
    expect(r.verdict).toBe("ok");
    expect(r.cleaned).toBe("Cmaj7zz");
  });

  it("rejects empty / whitespace-only input", () => {
    expect(evaluateSubmission("   ", 1000, createThrottleState()).verdict).toBe("empty");
  });

  it("trims and caps the query at MAX_QUERY_LENGTH", () => {
    const long = "x".repeat(MAX_QUERY_LENGTH + 50);
    const r = evaluateSubmission(`  ${long}  `, 1000, createThrottleState());
    expect(r.cleaned.length).toBe(MAX_QUERY_LENGTH);
  });

  it("dedupes case-insensitively against already-submitted keys", () => {
    const state = createThrottleState();
    state.submitted.add("cmaj7zz");
    expect(evaluateSubmission("CMAJ7ZZ", 999_999, state).verdict).toBe("duplicate");
  });

  it("throttles a distinct query fired within the window", () => {
    const state = createThrottleState();
    state.lastSubmitAt = 1000;
    expect(evaluateSubmission("newquery", 1000 + REPORT_THROTTLE_MS - 1, state).verdict).toBe(
      "throttled",
    );
  });

  it("allows a distinct query once the throttle window passes", () => {
    const state = createThrottleState();
    state.lastSubmitAt = 1000;
    expect(evaluateSubmission("newquery", 1000 + REPORT_THROTTLE_MS, state).verdict).toBe("ok");
  });

  it("does not mutate the passed-in state (caller commits on success)", () => {
    const state = createThrottleState();
    evaluateSubmission("something", 5000, state);
    expect(state.submitted.size).toBe(0);
    expect(state.lastSubmitAt).toBe(Number.NEGATIVE_INFINITY);
  });
});
