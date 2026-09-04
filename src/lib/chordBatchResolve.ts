// Batch chord resolution: turns a multi-chord string ("C Am F G", "Db, C-7") into
// one card per token. Pure logic, no I/O — unit-tested in
// __tests__/chordBatchResolve.test.ts.
//
// Resolution deliberately reuses parseQuery() (enharmonics, jazz shorthand, unicode
// accidentals) and then requires an EXACT hit in the index. It does not fall back to
// searchChords()' prefix/substring/fuzzy tiers: those exist to keep a single-chord
// palette forgiving mid-typing, but here they misfire on the browse vocabulary the
// palette also accepts — "dim" would parse as root D + suffix "im" and substring-match
// D dim, so "b dim" (meaning B diminished) would look like a two-chord batch. Exact-only
// keeps the batch/browse boundary crisp and makes an unknown token a "not found" card,
// which is the documented graceful path.

import { parseQuery, type ChordIndexEntry } from "@/lib/chordSearch";

// Upper bound on cards rendered from one query. Well past any real progression;
// guards the grid (and the per-keystroke classification) against pathological input.
export const MAX_BATCH_TOKENS = 16;

// Any whitespace or explicit separator splits tokens.
const TOKEN_SEPARATOR = /[\s,|]+/;

// Comma and pipe never occur inside a chord name or inside the free-form browse
// phrases the palette accepts ("all b chords"), so their presence is an unambiguous
// signal that the user means "these are separate chords" — the deterministic way to
// force batch mode regardless of how many tokens actually resolve.
const EXPLICIT_SEPARATOR = /[,|]/;

export interface ResolvedChordToken {
  readonly key: string; // stable React key; tokens may legitimately repeat (C Am F G C)
  readonly token: string; // the user's original spelling, for display on a miss
  readonly status: "resolved";
  readonly root: string; // stored spelling
  readonly suffix: string; // stored spelling
}

export interface UnresolvedChordToken {
  readonly key: string;
  readonly token: string;
  readonly status: "not_found";
}

export type BatchToken = ResolvedChordToken | UnresolvedChordToken;

export interface BatchQuery {
  readonly tokens: readonly BatchToken[];
  readonly resolvedCount: number;
  // Whether the palette should offer the "view as diagrams" row for this query.
  readonly shouldOffer: boolean;
  // True when the raw input carried more tokens than MAX_BATCH_TOKENS.
  readonly truncated: boolean;
}

// Index keyed for O(1) exact lookup. Suffixes are lower-cased in the key so a typed
// "/g" finds the stored "/G"; the stored entry is kept as the value so callers always
// get the canonical spelling back, never the user's.
export type ChordLookup = ReadonlyMap<string, ChordIndexEntry>;

function lookupKey(root: string, suffix: string): string {
  return `${root}|${suffix.toLowerCase()}`;
}

// Built once per index by the caller (useMemo in the palette, per-request on the
// server) so classification stays O(token count) on every keystroke.
export function buildChordLookup(index: readonly ChordIndexEntry[]): ChordLookup {
  const map = new Map<string, ChordIndexEntry>();
  for (const entry of index) map.set(lookupKey(entry.root, entry.suffix), entry);
  return map;
}

// Splits on whitespace/comma/pipe. Duplicates are preserved — a repeated chord is
// meaningful in a progression — and the list is capped at MAX_BATCH_TOKENS.
export function splitChordTokens(raw: string): string[] {
  const all = raw.trim().split(TOKEN_SEPARATOR).filter((t) => t.length > 0);
  return all.slice(0, MAX_BATCH_TOKENS);
}

// Resolves one token to a stored (root, suffix) pair, or null when nothing matches.
// A token that doesn't start with a root letter (parseQuery gives root === null) is
// rejected outright — that alone filters the quality words ("minor", "power", "sus")
// that share the input surface with chord names.
export function resolveChordToken(lookup: ChordLookup, token: string): ChordIndexEntry | null {
  const { root, suffixQuery, normalizedSuffix } = parseQuery(token);
  if (root === null) return null;
  return (
    lookup.get(lookupKey(root, normalizedSuffix)) ??
    // The alias table maps "" → "major" and "-7" → "m7"; the raw remainder still gets a
    // look-up for suffixes stored verbatim but not aliased (e.g. "sus2", "7b9").
    lookup.get(lookupKey(root, suffixQuery)) ??
    null
  );
}

// Classifies a raw query and resolves every token in one pass. The palette uses
// `shouldOffer` as the gate; the grid route uses `tokens` directly, since a ?q= URL is
// already an explicit statement of intent and needs no heuristic.
export function classifyBatchQuery(lookup: ChordLookup, raw: string): BatchQuery {
  const rawCount = raw.trim().split(TOKEN_SEPARATOR).filter((t) => t.length > 0).length;
  const tokens: BatchToken[] = splitChordTokens(raw).map((token, i) => {
    const key = `${i}-${token}`;
    const hit = resolveChordToken(lookup, token);
    return hit
      ? { key, token, status: "resolved", root: hit.root, suffix: hit.suffix }
      : { key, token, status: "not_found" };
  });

  const resolvedCount = tokens.filter((t) => t.status === "resolved").length;
  const unresolvedCount = tokens.length - resolvedCount;

  // Two tokens minimum — there is nothing to place side by side below that. Then either
  // the user separated them explicitly (comma/pipe wins outright), or the input has to
  // look convincingly like a chord list on its own: at least two real chords, and more
  // hits than misses. That second rule is what keeps "b minor" (1 hit, 1 miss) and
  // "all b chords" (1 hit, 2 misses) on the existing browse-shortcut path.
  const shouldOffer =
    tokens.length >= 2 &&
    (EXPLICIT_SEPARATOR.test(raw) || (resolvedCount >= 2 && resolvedCount > unresolvedCount));

  return { tokens, resolvedCount, shouldOffer, truncated: rawCount > MAX_BATCH_TOKENS };
}

// Canonical link to the grid for a raw query. Kept here rather than in a component so
// the search palette can link to the grid without importing it.
export function batchGridHref(query: string): string {
  return `/chords/grid?q=${encodeURIComponent(query)}`;
}
