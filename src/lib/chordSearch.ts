// Client-side chord search: musician-friendly normalization + ranked matching over
// the in-memory chord index. Pure logic, no I/O — unit-tested in
// __tests__/chordSearch.test.ts.
//
// The index is built server-side (see the chords layout) and filtered through
// isBrowsableSuffix so search can never surface a chord the browse UI hides.

import {
  ROOT_CHROMATIC_ORDER,
  CHORD_SUFFIX_CATEGORIES,
  UNKNOWN_ROOT,
  UNKNOWN_SUFFIX,
  getSuffixCategory,
  isSlashChord,
} from "@/lib/chordSuffixes";

export interface ChordIndexEntry {
  readonly root: string; // stored spelling: C C# D Eb E F F# G Ab A Bb B
  readonly suffix: string; // stored suffix: "major", "m7", "/G", "m/C#", ...
}

export interface ChordSearchResult {
  readonly root: string;
  readonly suffix: string;
  readonly category: string; // display category, e.g. "Major", "Slash Chords"
}

export interface ParsedQuery {
  readonly root: string | null; // stored spelling, or null if no root parsed
  readonly suffixQuery: string; // remainder after the root (normalized, no spaces)
  readonly normalizedSuffix: string; // suffixQuery mapped through the alias table
}

// --- root parsing / enharmonic mapping -------------------------------------
// Maps every accidental spelling a user might type onto the ONE spelling stored
// in the table. The stored set is C C# D Eb E F F# G Ab A Bb B — so flats like Db
// and sharps like D# must resolve to their stored enharmonic equivalent.
const ROOT_ALIASES: Readonly<Record<string, string>> = {
  c: "C",
  "c#": "C#",
  db: "C#",
  d: "D",
  "d#": "Eb",
  eb: "Eb",
  e: "E",
  fb: "E", // Fb ≡ E
  "e#": "F", // E# ≡ F
  f: "F",
  "f#": "F#",
  gb: "F#",
  g: "G",
  "g#": "Ab",
  ab: "Ab",
  a: "A",
  "a#": "Bb",
  bb: "Bb",
  b: "B",
  cb: "B", // Cb ≡ B
  "b#": "C", // B# ≡ C
};

const ROOT_LETTERS = new Set(["a", "b", "c", "d", "e", "f", "g"]);

// Normalizes raw input: unicode accidentals → ASCII, Δ/Δ7 → maj7, lowercase,
// strip all whitespace (so "  c MAJ 7  " collapses to "cmaj7").
function normalizeInput(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/[Δ∆]7?/g, "maj7")
    .toLowerCase()
    .replace(/\s+/g, "");
}

// Extracts a stored root spelling from the front of a normalized string, plus the
// remaining suffix text. Tries a two-char accidental token first (c#, db, eb, ...),
// then falls back to the bare letter.
function parseRoot(normalized: string): { root: string | null; rest: string } {
  if (normalized.length === 0) return { root: null, rest: "" };
  const letter = normalized[0];
  if (!ROOT_LETTERS.has(letter)) return { root: null, rest: normalized };

  const maybeAccidental = normalized[1];
  if (maybeAccidental === "#" || maybeAccidental === "b") {
    const token = letter + maybeAccidental;
    const mapped = ROOT_ALIASES[token];
    if (mapped) return { root: mapped, rest: normalized.slice(2) };
    // Accidental didn't map (unlikely) — treat the letter alone as the root.
  }
  return { root: ROOT_ALIASES[letter] ?? null, rest: normalized.slice(1) };
}

// Maps the suffix remainder through whole-token aliases onto a stored suffix.
// Only exact-token aliases live here; partial input is handled by prefix matching.
function normalizeSuffix(rest: string): string {
  // Leading "-" is jazz shorthand for minor: C- = Cm, C-7 = Cm7.
  const s = rest.startsWith("-") ? "m" + rest.slice(1) : rest;
  switch (s) {
    case "":
      return "major";
    case "maj":
    case "major":
      return "major";
    case "major7":
    case "majorseven":
      return "maj7";
    case "m":
    case "min":
    case "minor":
      return "minor";
    case "dominant7":
    case "dom7":
      return "7";
    case "halfdim":
    case "halfdiminished":
      return "m7b5";
    default:
      return s;
  }
}

// A slash chord's bass note is a root like any other, and is stored spelled the
// way roots are stored ("/G", "m/C#"). Typed input arrives lowercased by
// normalizeInput, so "c/d#" would otherwise be filed as "/d#" — a suffix nothing
// else in the product would ever produce.
function normalizeSlashBass(suffix: string): string {
  const at = suffix.indexOf("/");
  if (at < 0) return suffix;
  const { root, rest } = parseRoot(suffix.slice(at + 1));
  if (root === null || rest !== "") return suffix;
  return `${suffix.slice(0, at)}/${root}`;
}

/**
 * A typed chord name as the identity it would be stored under: "cadd9#11" →
 * `{ root: "C", suffix: "add9#11" }`, "c/d#" → `{ root: "C", suffix: "/Eb" }`.
 *
 * The same reading `searchChords` does, stopped one step earlier: search asks
 * which stored chord a query is looking for, this asks what the query itself
 * says. That is what a chord the library does not carry needs — there is
 * nothing to match it against, and the player's own shape still has to be filed
 * somewhere findable.
 *
 * Null when nothing in the input reads as a root note — the one thing a chord
 * identity cannot be invented without, and the reason `unknown` is a name in its
 * own right rather than a missing one.
 */
export function normalizeChordName(raw: string): ChordIndexEntry | null {
  // The one name that needs no root: a chord the player cannot identify. Filing
  // it under the note in its bass would be a guess, and would bury it among the
  // chords of a key it may well not belong to.
  if (normalizeInput(raw) === UNKNOWN_SUFFIX) {
    return { root: UNKNOWN_ROOT, suffix: UNKNOWN_SUFFIX };
  }
  const { root, normalizedSuffix } = parseQuery(raw);
  if (root === null) return null;
  return { root, suffix: normalizeSlashBass(normalizedSuffix) };
}

export function parseQuery(raw: string): ParsedQuery {
  const normalized = normalizeInput(raw);
  const { root, rest } = parseRoot(normalized);
  return {
    root,
    suffixQuery: rest,
    normalizedSuffix: normalizeSuffix(rest),
  };
}

// --- ranking keys ----------------------------------------------------------
// Tie-breaks come from the taxonomy, never DB order: roots by chromatic pitch,
// suffixes by category-then-within-category position (slash chords last).
const ROOT_ORDER = new Map(ROOT_CHROMATIC_ORDER.map((r, i) => [r, i]));

const SUFFIX_ORDER = new Map<string, number>();
{
  let n = 0;
  for (const { suffixes } of CHORD_SUFFIX_CATEGORIES) {
    for (const s of suffixes) SUFFIX_ORDER.set(s, n++);
  }
}

function rootOrderKey(root: string): number {
  return ROOT_ORDER.get(root) ?? Number.MAX_SAFE_INTEGER;
}

function suffixOrderKey(suffix: string): number {
  const k = SUFFIX_ORDER.get(suffix);
  if (k !== undefined) return k;
  return isSlashChord(suffix) ? 100_000 : 90_000;
}

// --- fuzzy fallback --------------------------------------------------------
// Conservative single-edit tolerance for typos ("majr7" → "maj7"). Kept tight so
// it never resurrects excluded/near-miss junk (e.g. "7sg" must not match "7#9").
const FUZZY_MAX = 1;

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > FUZZY_MAX) return FUZZY_MAX + 1; // early bail
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Match tiers (lower = better): 0 exact, 1 prefix, 2 substring, 3 fuzzy.
interface Scored {
  readonly entry: ChordIndexEntry;
  readonly tier: number;
  readonly dist: number;
}

function scoreSuffix(suffixLower: string, rest: string, normSuffix: string): { tier: number; dist: number } | null {
  if (suffixLower === normSuffix || suffixLower === rest) return { tier: 0, dist: 0 };
  if (suffixLower.startsWith(rest) || suffixLower.startsWith(normSuffix)) return { tier: 1, dist: 0 };
  if (suffixLower.includes(rest)) return { tier: 2, dist: 0 };
  const d = levenshtein(rest, suffixLower);
  if (d <= FUZZY_MAX && d < suffixLower.length) return { tier: 3, dist: d };
  return null;
}

function toResult(entry: ChordIndexEntry): ChordSearchResult {
  const category = isSlashChord(entry.suffix)
    ? "Slash Chords"
    : (getSuffixCategory(entry.suffix) ?? "Other");
  return { root: entry.root, suffix: entry.suffix, category };
}

function compareScored(a: Scored, b: Scored): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.dist !== b.dist) return a.dist - b.dist;
  const rk = rootOrderKey(a.entry.root) - rootOrderKey(b.entry.root);
  if (rk !== 0) return rk;
  const sk = suffixOrderKey(a.entry.suffix) - suffixOrderKey(b.entry.suffix);
  if (sk !== 0) return sk;
  return a.entry.suffix.localeCompare(b.entry.suffix);
}

const DEFAULT_LIMIT = 10;

// Ranks the index against a query and returns the top matches. Empty/whitespace
// input returns []. A bare root ("C", "Db") lists that root's chords with the plain
// major shape first, then the rest in taxonomy order.
export function searchChords(
  index: readonly ChordIndexEntry[],
  query: string,
  limit: number = DEFAULT_LIMIT,
): ChordSearchResult[] {
  const { root, suffixQuery, normalizedSuffix } = parseQuery(query);
  if (root === null && suffixQuery === "") return [];

  const scored: Scored[] = [];

  if (root !== null) {
    const bareRoot = suffixQuery === "";
    for (const entry of index) {
      if (entry.root !== root) continue;
      if (bareRoot) {
        // Whole root: major first, then everything else by taxonomy order.
        scored.push({ entry, tier: entry.suffix === "major" ? 0 : 1, dist: 0 });
        continue;
      }
      const s = scoreSuffix(entry.suffix.toLowerCase(), suffixQuery, normalizedSuffix);
      if (s) scored.push({ entry, ...s });
    }
  } else {
    // No parseable root — match the whole normalized input against "root+suffix".
    const q = suffixQuery;
    for (const entry of index) {
      const combined = (entry.root + entry.suffix).toLowerCase();
      const s = scoreSuffix(combined, q, q);
      if (s) scored.push({ entry, ...s });
    }
  }

  scored.sort(compareScored);
  return scored.slice(0, limit).map((s) => toResult(s.entry));
}

// --- browse shortcuts ------------------------------------------------------
// Beyond matching individual chords, the palette offers "jump to browse" links:
// a root query ("B", "Db") points at that root's section on the all-chords page,
// and a quality word ("minor", "dim", "sus") points at that category's section.
// The component turns these into /chords/all deep-links via the shared
// tocSectionId anchors — this module stays routing-agnostic and just classifies.

export type NavShortcut =
  | { readonly kind: "root"; readonly root: string } // stored root spelling, e.g. "C#"
  | { readonly kind: "category"; readonly category: string } // CHORD_SUFFIX_CATEGORIES label
  | { readonly kind: "root-category"; readonly root: string; readonly category: string }; // e.g. B + Minor

// Quality keywords → category labels. An explicit alias table (not derived from the
// labels) so shorthand like "dom"/"dim" resolves; the category strings must stay in
// sync with CHORD_SUFFIX_CATEGORIES — asserted by a test to prevent drift.
const CATEGORY_KEYWORDS: ReadonlyArray<{ readonly keyword: string; readonly category: string }> = [
  { keyword: "major", category: "Major" },
  { keyword: "minor", category: "Minor" },
  { keyword: "dominant", category: "Dominant 7th" },
  { keyword: "suspended", category: "Suspended" },
  { keyword: "diminished", category: "Diminished" },
  { keyword: "augmented", category: "Augmented" },
  { keyword: "power", category: "Power Chord" },
  { keyword: "powerchord", category: "Power Chord" },
];

// Below this length a query is too ambiguous to pin to a category — "d" is the root D,
// not "diminished"; "m" could be minor or any of a dozen chord shapes.
const CATEGORY_MIN_QUERY = 3;

function matchCategory(normalized: string): string | null {
  if (normalized.length < CATEGORY_MIN_QUERY) return null;
  for (const { keyword, category } of CATEGORY_KEYWORDS) {
    if (keyword.startsWith(normalized)) return category;
  }
  return null;
}

// Noise words in free-form input ("all b chords", "b minor chord") that carry no
// root/quality signal. Dropped before classification so the greedy root parser can't
// latch onto their leading letter (without this, "all" → root A).
const FILLER_WORDS: ReadonlySet<string> = new Set(["all", "chord", "chords"]);

// Classifies a query into at most one browse shortcut by reading it token-by-token
// rather than as one fused string. Aggregates the first root and first quality seen
// (order-independent, so "b minor" == "minor b"); a root + quality together links to
// the root's category subsection ("b-minor"). A whole-token quality word still wins
// over its incidental root parse ("dim"/"aug" mean the category, not D/A).
export function getNavShortcut(query: string): NavShortcut | null {
  const tokens = query
    .split(/\s+/)
    .map((t) => normalizeInput(t))
    .filter((t) => t.length > 0 && !FILLER_WORDS.has(t));

  let root: string | null = null;
  let category: string | null = null;

  for (const token of tokens) {
    const tokenCategory = matchCategory(token);
    if (tokenCategory) {
      category ??= tokenCategory;
      continue;
    }
    const parsed = parseRoot(token);
    if (parsed.root) {
      root ??= parsed.root;
      // A quality stuck to the root ("bminor", one token) still resolves.
      const restCategory = matchCategory(parsed.rest);
      if (restCategory) category ??= restCategory;
    }
  }

  if (root && category) return { kind: "root-category", root, category };
  if (category) return { kind: "category", category };
  if (root) return { kind: "root", root };
  return null;
}
