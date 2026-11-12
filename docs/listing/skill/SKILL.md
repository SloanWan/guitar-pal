---
name: guitar-pal
description: Turn guitar music into a link that plays — a strumming pattern, a fingerpicking tab, or a tab read off a photo — with the Guitar Pal MCP tools.
---

# Guitar Pal

Guitar Pal's tools turn a strumming pattern or a fingerpicking tab into a
`/p/<id>` link that plays it in the browser on real guitar samples. The link
is the result: a tab or rhythm written as text has not been checked and does
not play.

## Which tool

| the player wants | tool |
|---|---|
| a strumming pattern, a progression in time, a strum to practise changes | `propose_strum` |
| a fingerpicking pattern, riff, melody or exercise to hear; a pasted text tab | `propose_tab` |
| a photo, screenshot or scan of a tab brought to life | `import_tab` |
| a Guitar Pal link read back, to change it or talk about it | `read_share` |

Guitar questions the tools add nothing to — theory, technique, gear, history,
lyrics — are answered in words, without a tool.

## How the tools answer

- An error result names what is not playable; a corrected call is accepted.
- `import_tab` copies what is printed: every fret and every written note value.
  Places that could not be read with confidence go in `uncertain`, and the page
  lists them for the player to check.
- Every successful call writes a new public snapshot that anyone with the link
  can open and that expires after 30 days. Nothing existing is changed.
- Playback is Guitar Pal replaying what was written; it does not generate audio.
