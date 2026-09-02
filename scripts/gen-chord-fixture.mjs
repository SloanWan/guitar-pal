// Regenerates src/lib/__fixtures__/chordData.fixture.ts from the live `chords` table.
// Run after any chord-data import: `node --env-file=.env.local scripts/gen-chord-fixture.mjs`
// (or plain `node scripts/gen-chord-fixture.mjs` if the Supabase env vars are already exported).
//
// The fixture backs two CI invariants (slug round-trip + no orphan suffix), so it
// must stay in sync with the table. Not covered by the unit-test constraint — this
// is a maintenance script, per CLAUDE.md /scripts conventions.

import { writeFileSync } from "fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env.local scripts/gen-chord-fixture.mjs");
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/chords?select=root,suffix`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error("HTTP", res.status, await res.text());
  process.exit(1);
}

const rows = await res.json();
rows.sort((a, b) => a.root.localeCompare(b.root) || a.suffix.localeCompare(b.suffix));
const distinctSuffixes = [...new Set(rows.map((r) => r.suffix))].sort();

const pairLines = rows
  .map((r) => `  { root: ${JSON.stringify(r.root)}, suffix: ${JSON.stringify(r.suffix)} },`)
  .join("\n");
const sfxLines = distinctSuffixes.map((s) => `  ${JSON.stringify(s)},`).join("\n");

const content = `// AUTO-GENERATED FIXTURE — snapshot of the live \`chords\` table (root/suffix only).
//
// REGENERATE whenever chord data is imported/changed:
//   node --env-file=.env.local scripts/gen-chord-fixture.mjs
//
// Used by chordSearch.test.ts (slug round-trip over every real pair) and
// chordSuffixes.test.ts (the no-orphan-suffix invariant). These tests are the
// safety net: an un-categorised suffix or a non-round-tripping slug must fail CI,
// not sit invisible in production.

export interface ChordRow {
  readonly root: string;
  readonly suffix: string;
}

// Every root/suffix pair in the table (${rows.length} rows, ${distinctSuffixes.length} distinct suffixes).
export const CHORD_ROWS: readonly ChordRow[] = [
${pairLines}
];

// Distinct suffixes across all roots (${distinctSuffixes.length}).
export const DISTINCT_SUFFIXES: readonly string[] = [
${sfxLines}
];
`;

writeFileSync("src/lib/__fixtures__/chordData.fixture.ts", content);
console.log(`Wrote src/lib/__fixtures__/chordData.fixture.ts: ${rows.length} rows, ${distinctSuffixes.length} suffixes.`);
