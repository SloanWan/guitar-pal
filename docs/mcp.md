# Guitar Pal MCP server

Compose in your AI assistant, play in Guitar Pal. The site exposes an
[MCP](https://modelcontextprotocol.io) server at `/api/mcp`: connect it to any
MCP client — claude.ai, Claude Desktop, Claude Code, Cursor, VS Code, ChatGPT,
your own agent — ask for a strumming pattern or a fingerpicking tab, and what
the model writes comes back as a link that opens in the full player. No account
is needed to connect or to open a link.

MCP is an open protocol, not tied to one vendor. This server speaks the current
Streamable HTTP transport, stateless, with JSON responses and no authentication,
which is the most widely supported combination. What differs between clients is
the model behind them: `import_tab` asks for a fairly detailed structure, and
reading a screenshot needs a model that can see images.

## Connect

The URL is `https://guitarpal.sloanwan.com/api/mcp`.

- **claude.ai / Claude Desktop:** Settings → Connectors → Add custom connector,
  paste the URL. No authentication.
- **Claude Code:** `claude mcp add --transport http guitar-pal https://guitarpal.sloanwan.com/api/mcp`
- **Cursor** (`~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project):

  ```json
  { "mcpServers": { "guitar-pal": { "url": "https://guitarpal.sloanwan.com/api/mcp" } } }
  ```

- **VS Code** (`.vscode/mcp.json`):

  ```json
  { "servers": { "guitar-pal": { "type": "http", "url": "https://guitarpal.sloanwan.com/api/mcp" } } }
  ```

- **ChatGPT and other chat products:** add it where the product takes a remote
  MCP server (connectors / developer mode). Some products insist on OAuth for
  remote servers; this one has none, so it may be refused there.
- **Anything else:** point it at the URL as a Streamable HTTP server. POST every
  request; there is no session, no SSE stream and no `initialize` handshake to
  keep alive. Clients that only speak the older SSE transport, or only launch
  stdio servers, need a bridge such as `mcp-remote`.

## What to ask

> A slow 6/8 fingerpicking pattern over Am–F–C–G, thumb on the bass.

> Strum pattern for a campfire song, C G Am F, 90 bpm.

> *(with a photo of a tab)* Bring this into Guitar Pal.

> Make bar 2 of https://guitarpal.sloanwan.com/p/aB3xK9mQ2z simpler.

Each answer carries a link like `https://guitarpal.sloanwan.com/p/aB3xK9mQ2z`.
The page is the player: play, loop a section, change the tempo. **Import**
copies the pattern into your own library (locally as a guest, to your account
when signed in), where the editor is. A link is a snapshot — every revision is
a new link — and links made here stop opening after 30 days.

## Tools

| tool | what the model gives it | what checks it |
|---|---|---|
| `propose_strum` | one bar of rhythm in the app's notation (`D DU UD `), chord names one per bar, tempo, capo | the same builder the in-app assistant uses; every chord is looked up in the library |
| `propose_tab` | notes on a grid of even slots per bar (`{string, fret, slot}`, 1 = high e), meter, tempo | the same builder the in-app assistant uses, then the import validator |
| `import_tab` | bars of slots, each with its printed note value and the notes as `{string, fret}` (1 = high e) | the same validator the book import uses, plus a check that no bar overflows its meter |
| `read_share` | a link or its id | reads the share back as text, and as `import_tab` bars for a tab |

`import_tab` is for a tab the model read off an image or a printed page, where
the rhythm is written and should not be re-guessed from spacing. The model reads
the image; the server never sees it. What the validator cannot know is whether a
note sits on the right string — a wrong string is still a legal fret — so the
tool asks the model to list the places it was unsure of, and writes them under
the pattern's name on the page. Check those against the original.

Nothing is stored that did not pass the validators. The model never writes
frets or MIDI directly into the app: it writes notation, and the app decides
what it amounts to.

## Limits

Per IP: 120 calls and 20 new links an hour. All callers together: 200 new links
a day (`MCP_DAILY_SHARES`). Over a limit, the tool answers with a message the
model relays and offers the pattern as text instead.

## Running your own

The route needs, beyond the app's own env:

```
SUPABASE_SERVICE_ROLE_KEY=   # shared_items insert is owner-scoped; the server writes as one account
MCP_SHARE_OWNER_ID=          # that account's auth.users id — create a user for it
# MCP_DAILY_SHARES=200
# MCP_SHARE_TTL_DAYS=30      # 0 keeps links forever
```

and `scripts/add-shared-items-expiry.sql` run once, which adds
`shared_items.expires_at` and gives the cleanup statement. **Run the SQL before
deploying this code:** `loadShare` selects the column, so every `/p/<id>` page —
not only the MCP — fails until it exists. With either required variable unset,
the tools still list and validate; saving answers with a refusal that says the
server is not set up for it.

Locally: `npm run dev`, then connect `http://localhost:3000/api/mcp`, or drive
it by hand:

```sh
curl -s http://localhost:3000/api/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
