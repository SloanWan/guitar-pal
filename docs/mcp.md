# Guitar Pal MCP server

Ask Claude or ChatGPT for a strumming pattern or a fingerpicking tab, or show it
a photo of a tab, and get back a link that plays it in Guitar Pal.

Server URL: `https://guitarpal.sloanwan.com/api/mcp` — no account, no API key.

The same guide, in English and Chinese with every snippet ready to copy:
[guitarpal.sloanwan.com/docs/mcp](https://guitarpal.sloanwan.com/docs/mcp).

## Connect

### Claude (claude.ai, desktop and mobile apps)

Works on every Claude plan; the Free plan allows one custom connector.

1. **Customize → Connectors → + Add → Add custom connector.**
2. Name it `Guitar Pal`, paste the URL, choose **No sign-in**, and add it.
3. In a chat, turn it on from **+ → Connectors** in the message box.

A connector added on the web also shows up in the desktop and mobile apps.

### ChatGPT (web, desktop and mobile apps)

Needs ChatGPT Plus or a higher plan; Free accounts cannot add it.

1. On the web, open [chatgpt.com/plugins](https://chatgpt.com/plugins), press
   **+ → Add custom MCP server**.
2. Name it `Guitar Pal`, paste the URL, choose **No authentication**.
3. Tick **I understand and want to continue**, press **Create as a plugin**.
4. In a new chat, type **@** and pick Guitar Pal.

Adding works on the web only; once added, it works in the apps too. ChatGPT
asks once per chat before the first call that creates a link.

### Claude Code

```sh
claude mcp add --transport http guitar-pal https://guitarpal.sloanwan.com/api/mcp
```

### Cursor

`~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project:

```json
{ "mcpServers": { "guitar-pal": { "url": "https://guitarpal.sloanwan.com/api/mcp" } } }
```

### VS Code

`.vscode/mcp.json`:

```json
{ "servers": { "guitar-pal": { "type": "http", "url": "https://guitarpal.sloanwan.com/api/mcp" } } }
```

## Which model

- **Claude:** any current model writes strumming patterns and tabs well. To
  read a tab image, use Opus or Sonnet; Haiku gets about half the notes wrong.
- **ChatGPT:** avoid Instant — it transcribes poorly or skips the tool. Use a
  Thinking model at medium effort or above.

Even Opus and Sonnet sometimes put a number on the neighbouring string when
reading an image, so compare the result with the original.

## Try it

Name Guitar Pal in the request; ChatGPT in particular may not use it otherwise.

| to | ask |
|---|---|
| write a fingerpicking tab | *Use Guitar Pal to write a slow 6/8 fingerpicking pattern over Am–F–C–G, thumb on the bass.* |
| write a strumming pattern | *Make me a Guitar Pal strumming pattern for C G Am F at 90 bpm.* |
| read a tab image | *(attach a photo or screenshot of a tab)* *Bring this tab into Guitar Pal.* |
| change a link | *Make bar 2 of https://guitarpal.sloanwan.com/p/aB3xK9mQ2z simpler.* |

## What you get back

A link like `https://guitarpal.sloanwan.com/p/aB3xK9mQ2z` that opens in the
player: play, loop, change the tempo. **Import** copies it into your library
(in the browser as a guest, to your account when signed in) to edit it.

- Each change makes a new link; links stop working after 30 days.
- When reading an image, the model lists the notes it was unsure of under the
  title. Check those against the original.

## For developers

Tools: `propose_strum` (rhythm notation + chords), `propose_tab` (notes on a slot
grid), `import_tab` (bars with written note values, for a tab read off an
image), `read_share` (a link back as text). Everything passes the app's own
validators before a link is made; the model writes notation, never audio or raw
pitches. The server is Streamable HTTP, stateless, JSON responses, no auth.
Calls and new links are rate-limited per IP; over a limit the tool returns a
message instead of a link.

Tool annotations, and why:

| tool | readOnly | destructive | openWorld | why |
|---|---|---|---|---|
| `propose_strum`, `propose_tab`, `import_tab` | false | false | true | each call saves a new share; nothing existing is changed or removed; the share is a public link, so the call publishes |
| `read_share` | true | false | false | reads a share by id and writes nothing; only Guitar Pal's own shares |

The write tools' descriptions say the same in words: a new public `/p/<id>`
snapshot, open to anyone with the link, expiring after `MCP_SHARE_TTL_DAYS`.
`src/lib/mcp/__evals__/routing.eval.ts` checks whether models call the tools
when they should and not otherwise (`MCP_EVAL_LABEL=<label> npm run evals --
src/lib/mcp`, results in `routing-results.json`); `__evals__/quality/run.ts`
scores what they write.

Running your own: beyond the app's env, set `SUPABASE_SERVICE_ROLE_KEY` and
`MCP_SHARE_OWNER_ID` (the account shares are written as), optionally
`MCP_DAILY_SHARES` (default 200) and `MCP_SHARE_TTL_DAYS` (default 30, 0 keeps
links forever), and run `scripts/add-shared-items-expiry.sql` once before
deploying. Locally:

```sh
curl -s http://localhost:3000/api/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
