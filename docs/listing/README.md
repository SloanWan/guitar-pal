# Listing kit — the Guitar Pal MCP server

Everything the MCP directories ask for, kept in one place, so submitting is
copying from these files (#492). The copy itself is `listing.json` (English and
Chinese); the OpenAI test cases are `openai-test-cases.json`; the icons are in
`assets/`.

| | |
|---|---|
| Name | Guitar Pal |
| Slug | `guitar-pal` (permanent on Claude once published) |
| Server | `https://guitarpal.sloanwan.com/api/mcp` — Streamable HTTP, stateless, JSON responses, no authentication |
| Website | https://guitarpal.sloanwan.com |
| Docs | https://guitarpal.sloanwan.com/docs/mcp |
| Privacy | https://guitarpal.sloanwan.com/privacy |
| Terms | https://guitarpal.sloanwan.com/terms |
| Support | https://guitarpal.sloanwan.com/support · nysuswan@gmail.com |
| Developer | Sloan Wan (individual) |
| Icons | `assets/icon-512.png` (512×512, 24 KB, also the under-200 KB copy), `assets/icon.svg` (square viewBox) |

## Before any submission

- [ ] #491 merged and deployed (hosted clients' bucket).
- [ ] `/privacy`, `/terms`, `/support` live.
- [ ] MCP Inspector over `tools/list` and each tool against production.
- [ ] Each tool once on claude.ai and on ChatGPT.
- [ ] `/api/mcp` reachable from a mainland China cloud host (ModelScope, MCPWorld).
- [ ] A demo recording (web and phone), its URL in `listing.json` as `demoRecordingUrl`.
- [ ] The hostname stays `guitarpal.sloanwan.com` (OpenAI does not allow changing it after submission).

## Reviewer instructions

No account, API key or sign-in is needed.

1. Add the server URL as a custom connector / MCP server with no authentication.
2. **propose_strum**: "Make me a Guitar Pal strumming pattern for C G Am F at 90 bpm." Expect a `/p/<id>` link; it opens a player with four bars at 90 bpm.
3. **propose_tab**: "Use Guitar Pal to write a slow 6/8 fingerpicking pattern over Am–F–C–G." Expect a link to a playable tab in 6/8.
4. **import_tab**: attach `https://guitarpal.sloanwan.com/listing/sample-tab.png` and say "Bring this tab into Guitar Pal." Expect a link to the same tab, playable.
5. **read_share**: paste a link from step 2 and say "Make this busier with more up-strums." Expect read_share, then a new link; the old one is unchanged.

Every link is a public snapshot that expires after 30 days. Over a rate limit a tool answers with a message instead of a link.

## Claude — Connectors Directory

claude.ai/directory/manage → Submit new → MCP connector. No package: the fields come from here.

- Name, tagline (`taglineLong`, ≤200), description (`description`, ≤2000), categories, example prompts (≥3, `prompts`), icon, docs / privacy / support URLs, server URL, authentication: none.
- Tool annotations are on the server (`src/lib/mcp/server.ts`); their reasons are in `docs/mcp.md`.
- Data handling: own API; no health, financial or children's data; no sponsored content; tool input is stored as public share rows for 30 days.
- Read the compliance attestations before ticking them.

## OpenAI — ChatGPT / Codex plugin directory

```sh
node scripts/build-openai-plugin.mjs    # → dist/openai-plugin/guitar-pal-<version>.zip
```

The script checks OpenAI's limits (30-character name and subtitle, 3 default
prompts of ≤128 characters, exactly 5 positive and 3 negative test cases) and
packs `plugin.json`, `mcp.json` (`streamable-http`, `auth.type: "none"`, no
headers), the icons and a skill.

- **Domain verification:** set `OPENAI_APPS_CHALLENGE_TOKEN` on the server to the token the portal shows; `https://guitarpal.sloanwan.com/.well-known/openai-apps-challenge` then returns it as plain text (404 while unset).
- Identity: individual verification with a government ID; global data residency project.
- Reviewer instructions go in the portal (above), not in the ZIP.

## MCP Registry

```sh
brew install mcp-publisher
mcp-publisher validate docs/listing/server.json
mcp-publisher login github     # io.github.SloanWan/* namespace
mcp-publisher publish docs/listing/server.json
```

`server.json` uses the GitHub namespace `io.github.SloanWan/guitar-pal` (the GitHub login, as GitHub spells it), which
needs no DNS or file on the server. A domain namespace
(`com.sloanwan.guitarpal/…`) would need a TXT record or
`/.well-known/mcp-registry-auth`. The registry is in preview and does not check
that the remote URL is ours.

## ModelScope — MCP square

"Custom create", hosted, config:

```json
{ "mcpServers": { "guitar-pal": { "type": "streamable_http", "url": "https://guitarpal.sloanwan.com/api/mcp" } } }
```

Its proxy runs `list_tools` as the check. Description from `listing.json` → `zh`.

## Baidu MCPWorld

Form: name, description without emoji (`zh.description`), Markdown details
(this README's reviewer steps), logo (`assets/icon-512.png`), transport
`streamablehttp`, the server URL.
