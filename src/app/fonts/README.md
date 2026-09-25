# Fonts

Self-hosted so the build never reaches the network (#291). `next/font/google`
downloads these during `next build`, and that download failed three times in
three days — once on a branch that changed nothing but a Markdown file. On
`main` a flaked build also skips the deploy, because `deploy.yml` only runs on
`workflow_run.conclusion == 'success'`.

| file | family | version | axis |
|---|---|---|---|
| `JetBrainsMono-latin-greek.woff2` | JetBrains Mono | 2.211 | `wght 400–800` |
| `SpaceGrotesk-Variable-latin.woff2` | Space Grotesk | 2.000 | `wght 300–700` |

Both are the files Google was serving, at the versions and weight axes the
previous `next/font/google` build shipped, so no glyph or metric moved. The
Space Grotesk file is byte-identical to the one that build emitted, and the
generated fallback faces (`local(Arial)` with `size-adjust` and
`ascent-override`) come out character-for-character the same.

Measured across both builds: every sample of ASCII and Latin-1 text is identical
to the hundredth of a pixel at each weight the design uses. The one difference is
an improvement — `Δ` and `τ` live in Google's `greek` subset, which the browser
only fetched once a page actually painted one, so they used to appear in a
fallback until that second request landed. They are in the single file now.

## What is and is not covered

Google splits a family into subsets and serves one file per subset, each with a
`unicode-range`; the browser fetches only the ones a page needs. `next/font/local`
generates a single `@font-face` per call and so cannot express that, which is why
these are one file per family:

- **Space Grotesk** — the `latin` subset as served.
- **JetBrains Mono** — `latin` **and** `greek` merged into one file, because `Δ`
  (major seventh) and `τ` come from `greek`, and losing them would change how
  chord names render. Merged by asking the CSS API for exactly the union of the
  two `unicode-range`s via its `text=` parameter, so the glyphs are still
  Google's own.

Dropped along the way: `latin-ext`, `cyrillic`, `cyrillic-ext`, `vietnamese` —
363 glyphs from JetBrains Mono and 404 from Space Grotesk. **No character in
`src/` uses any of them**, checked before the switch. Text a player types in one
of those scripts falls back to `ui-monospace` / `system-ui`, as CJK already did:
no Google subset of either family carries CJK.

## The family name

`next/font/local` names the family after the variable the loader is assigned to,
so these are `mono` and `sans` rather than `JetBrains Mono` and `Space Grotesk`,
which is what `next/font/google` produced. Nothing that reads the CSS variables
notices, but three call sites had the old name written out as a string, for
VexFlow text that is drawn outside the DOM and so cannot read a variable. They
now import `MONO_FAMILY` from `fonts.ts`. **Do not spell a family name out again**
— it silently stops matching and the staves fall back to the system mono.

That is also why the loaders live in `fonts.ts` rather than in `layout.tsx`:
anything needing the name can import them.

## Refreshing them

1. Fetch the CSS with a browser User-Agent, or Google answers with `ttf` URLs:
   `curl -A "<modern UA>" "https://fonts.googleapis.com/css2?family=<Family>:wght@<min>..<max>&display=swap"`
2. Read the `unicode-range` of each subset you want out of that CSS rather than
   from memory — they change.
3. For one file spanning several subsets, request again with
   `&text=<every character in those ranges the font actually has>`; the reply is
   a single `@font-face` whose `src` has no `.woff2` extension, so match on
   `url(...)` rather than the suffix.
4. Check the download with `fontTools`: family, `name` ID 5 for the version,
   the `fvar` axis, and the `cmap` against the file it replaces. A version drift
   moves glyph shapes.

Upstream releases are **not** interchangeable with these: the newest JetBrains
Mono tag is 2.304 against Google's 2.211.

## Licence

Both families are SIL Open Font License 1.1, which allows redistribution here.
`OFL-JetBrainsMono.txt` and `OFL-SpaceGrotesk.txt` are alongside.
