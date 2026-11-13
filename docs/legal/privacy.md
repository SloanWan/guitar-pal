# Privacy policy

Effective 13 November 2026.

Guitar Pal (guitarpal.sloanwan.com) is run by one person, Sloan Wan. This page
says what the site keeps about you, why, where, and how to have it removed.
Questions: [nysuswan@gmail.com](mailto:nysuswan@gmail.com).

## The short version

- Everything works without an account. Signed out, your library stays in your
  browser and nothing about you is sent to the server.
- With an account, the server keeps your email, your library and the settings
  you choose, so they follow you between devices.
- There are no ads, no analytics trackers, and nothing is sold.
- Some features send text or pages to an AI model provider to work. They are
  listed below.
- You can delete your data, or your whole account, from Settings.

## What is kept, and why

### Your account

Your email address and password, handled by Supabase Auth (the password is
stored hashed by Supabase, never by Guitar Pal), plus the nickname and avatar
you pick in Settings. Used to sign you in and to keep your library.

### Your library

Strumming patterns, chord progressions, fingerpicking tabs and the links you
attach to them, your own chord shapes, favourites, and which pattern you had
open last. Signed in, they are stored in the database so they follow you;
signed out, they stay in your browser only.

Home's "Most opened" list counts how often you open a pattern, tab, chord or
book. It is kept for signed-in players only.

### Share links

When you share a pattern, a copy of it is stored under a random link
(`/p/…`). **Anyone who has the link can open it.** Links you make in the app
stay until you delete your data or account. Links made through the MCP
connector (in Claude, ChatGPT and other AI apps) are not tied to any account
and stop opening after 30 days.

### The assistant

The Strum and Tab modes run in your browser; nothing you type there leaves it.

General mode sends your messages to an AI model provider (DeepSeek by default)
to answer: the conversation so far, the page you are on, the names of your own
patterns, and your interface language. Your email and account id are not sent.
The server logs that a request was made, with your account id or a random guest
id, the model and the size of the request, not what you wrote.

A guest's free turns are counted in a signed cookie on your browser
(`guitarpal_assistant_guest`, kept for one day).

The conversation is kept in your browser tab and cleared when the tab closes.
It is stored on the server only when you press Save, and you can delete saved
chats at any time.

### Books

If you upload a book, the PDF, its page images, the text read from its pages
and the exercises found in it are stored in a private area of the database
that only your account can reach. Text is read from scanned pages on our own
server. To find chapters, read exercises and answer your questions about a
chapter, pages and your questions are sent to an AI model provider (Anthropic,
or DeepSeek). Deleting a book deletes its file and everything read from it.

### The MCP connector

When an AI app such as Claude or ChatGPT uses Guitar Pal's tools, Guitar Pal
receives only what the app's model writes into the tool: a rhythm, chords,
notes. It does not receive your conversation, your account in that app, or the
images you show it (the app's model reads the image and sends the notes). What
the tool makes is stored as a share link, described above. Your use of the AI
app itself is governed by its own provider's privacy policy.

### Error and performance reports

When something breaks, or to measure how fast pages load, the browser sends a
report: the error message, the kind of page (with ids removed), phone or
desktop, your browser's user-agent string and the app version. Reports carry
no account id and no IP address. They are kept to fix problems, currently
without a fixed time limit. They are not sent at all from development builds.

### Requests and logs

Your IP address is used, in memory only, to limit how fast one address can call
the server, and is not stored in the database. The web server and the
application write operating logs, which can include IP addresses, the pages
requested and, for the assistant, the account id described above. These logs
are used only to run and protect the site.

### When a chord is missing

If you report a chord the library does not have, the search text is stored,
with your account id if you are signed in.

## In your browser

Guitar Pal stores things on your device: Supabase's sign-in cookies; your
library and preferences when signed out; settings such as the theme and the
player's layout; a copy of your library for offline use when signed in
(removed when you sign out); the email you last signed in with, to fill the
form; and sentences the assistant could not read, kept on your device to
improve suggestions and never sent anywhere. Clearing the site's data in your
browser removes all of it.

## Who processes data for Guitar Pal

- **Supabase**: database, sign-in and file storage.
- **Tencent Cloud**: the server in Hong Kong that runs the site.
- **DeepSeek** and **Anthropic**: AI models for the assistant's General mode
  and for books, only for the requests described above.

The site's 404 page embeds a video from YouTube or Bilibili, which load their
own content under their own policies.

Guitar Pal does not sell your data or share it for advertising.

## Deleting your data

In **Settings → Delete**, "Delete my data" removes your patterns, progressions,
tabs, chord shapes, favourites, books, saved chats and share links; "Delete my
account" removes all of that and the account. It cannot be undone.

Not covered by that button: MCP share links (they belong to no account and
expire after 30 days), error reports (they are not linked to you), server logs,
copies already processed by an AI provider under its own terms, and data kept
only in your browser. To ask for anything else to be removed, email
[nysuswan@gmail.com](mailto:nysuswan@gmail.com).

## Children

Guitar Pal is not directed at children under 13 and does not knowingly collect
their data.

## Changes

If this policy changes, the new version is posted here with a new date.
