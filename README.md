# Guitar Pal — Feature Guide

**Guitar Pal** is a web-based practice studio designed to help guitar learners build better habits. It combines a strumming machine, a chord library, structured practice routines, and session tracking — all in one place.

---

## Getting Started

### Creating an Account

You can use the Strumming Machine and Chord Library without an account. To save exercises, routines, and practice logs, you need to sign up.

1. Click **Sign Up** in the top navigation bar.
2. Enter your email address and a password.
3. Click **Create Account**. You're taken straight to the dashboard — no email confirmation required.

To sign back in later, click **Log In** and use the same credentials. Press Enter after typing your password to submit quickly.

> **Already used the app without an account?** Any custom strum patterns or favourites you saved locally will be automatically merged into your account the first time you sign in.

---

## Navigation

The navigation bar at the top of every page gives you access to the three main areas of the app:

| Link          | What it is                                                |
| ------------- | --------------------------------------------------------- |
| **Strum**     | Strumming Machine — rhythm practice with audio playback   |
| **Chords**    | Chord Library — fingering diagrams for hundreds of chords |
| **Dashboard** | Your exercises, routines, and practice history            |

On mobile, the navigation collapses to fit smaller screens.

---

## Strumming Machine

Found at **Strum** in the navigation. This is the app's core practice tool — it plays a strumming pattern through your device's speaker while you strum along on your guitar.

### Reading the Pattern Grid

The large grid in the centre shows your current pattern. It is divided into **beats** (columns), and each beat contains one or more **strokes** (cells within the column).

Each cell shows a symbol:

| Symbol              | Meaning                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrow pointing down | **Down strum** — strum toward the floor                                                                                                                                 |
| Arrow pointing up   | **Up strum** — strum toward the ceiling                                                                                                                                 |
| **X**               | **Muted strum** — lightly rest your fretting hand on the strings and strum for a percussive "chuck" sound                                                               |
| Faint/grey arrow    | **Ghost stroke** — the arrow shows the direction of hand movement but you don't actually make contact with the strings; used to keep your strumming hand moving in time |
| Dot                 | **Rest** — no strum on this subdivision                                                                                                                                 |

Below each column you will see beat labels: **1, +, 2, +** and so on, which correspond to standard musical counting (1 = beat 1, + = the "and" between beats).

As the pattern plays, the **active beat lights up in blue** and the current cell within it is highlighted so you can always see exactly where you are.

### Choosing a Pattern

Open the **Strumming Library** sidebar to browse and select patterns. On large screens the library is always visible on the left. On smaller screens, tap the **grid icon** (top-right corner of the pattern card) to open it as a slide-in panel.

The library is divided into two tabs:

- **All** — shows every pattern available to you.
- **Favourites** — shows only patterns you have starred.

Within each tab there are two sections:

- **My Patterns** — custom patterns you have created yourself.
- **Presets** — the patterns that come built into Guitar Pal.

Click any pattern in the library to load it into the grid. The currently selected pattern is highlighted with a blue left border.

**Preset patterns included:**

| Name               | Character                                                   |
| ------------------ | ----------------------------------------------------------- |
| On the one         | Single downstroke on beat 1 only                            |
| On the beat        | Four steady downstrokes, one per beat                       |
| Old faithful       | Classic folk/pop pattern — D, DU, UD                        |
| Triplet on one     | Beat 1 uses a triplet roll; beats 2–4 are plain downstrokes |
| Triplet on 1+3     | Triplet rolls on beats 1 and 3                              |
| Birds of a feather | More complex 16th-note pattern (Billie Eilish style)        |
| Hualala            | Syncopated 3-note-per-beat pattern                          |
| Muted              | Alternating strums and muted "chuck" strokes                |

### Starring a Pattern

Click the **star icon** on any pattern card in the library to add it to your Favourites. Click it again to remove it. Favourites are synced to your account when you are signed in, or stored in your browser locally if you are not.

### Playback Controls

The **Controls** panel sits on the right side of the screen on desktop, or beneath the pattern grid on mobile.

**Playing and Stopping**

- Click the large **Play / Pause** button to start or stop the pattern.
- The pattern loops continuously by default.
- **Keyboard shortcut:** Press the **Spacebar** to play or pause (see Spacebar Mode below).

**Adjusting Tempo (BPM)**

BPM stands for _beats per minute_ — a higher number means a faster tempo.

- Drag the **BPM slider** to set your tempo anywhere from 40 to 220 BPM.
- Use the **+ / −** buttons to nudge the tempo up or down by 10 BPM at a time.
- The current BPM is shown as a large number in the centre of the controls.

**Tap Tempo**

If you want to match a song's tempo without knowing its BPM:

1. Play the song and tap the **Tap Tempo** button repeatedly in time with the beat.
2. After a few taps, Guitar Pal calculates the average interval between your taps and sets the BPM automatically.
3. Tapping resets if you stop for more than 2 seconds.

**Spacebar Mode**

A toggle beneath the Tap Tempo button lets you choose what the Spacebar does:

- **Play/Pause** — the default; Spacebar starts and stops playback.
- **Tap Tempo** — Spacebar acts as the tap button, so you can tap tempo hands-free without reaching for the mouse.

**Play Once**

Turn on the **Play once** toggle to play the pattern through a single time and then stop automatically. Useful when you want to hear a pattern once before trying it yourself.

### Sound Settings

The **Sound** section (tap the heading on mobile to expand it) lets you control what you hear during playback.

**Metronome**

A click track that keeps you in time.

- Toggle **Metronome** on or off.
- Choose the **tick subdivision** — how often you hear a click within each beat:
    - **1/4** — one click per beat (quarter notes). Best for beginners.
    - **1/8** — two clicks per beat (eighth notes). Helps you count the "ands".
    - **1/16** — four clicks per beat (sixteenth notes). For detailed timing work.
- Toggle **Accent beat 1** to make the first beat of each bar sound louder than the others, helping you hear where the bar starts.
- Adjust the **Metronome volume** slider.

**Strum Sound**

A synthesised guitar strum plays alongside the metronome so you can hear the pattern before you can play it yourself.

- Toggle **Strum Sound** on or off.
- Adjust the **Guitar volume** slider (can be turned up to 200% for a stronger effect).

### Creating Custom Patterns

Click **+ Create** at the top of the library sidebar to open the pattern creator.

1. **Name your pattern.** This is required — type any name you like.
2. **Design the pattern.** The grid shows four beats. Each beat starts with two cells. Click any cell to cycle it through the available strokes: Rest → Down → Up → Mute → Rest (and so on).
3. **Add or remove subdivisions.** Each beat can have 2, 3, or 4 cells, letting you create eighth-note, triplet, or sixteenth-note patterns. Use the **+** and **−** buttons below each beat column.
4. Click **Save pattern.**

If you are not signed in, you will be offered a choice:

- **Save locally** — saves the pattern to your browser. It will be available on this device only.
- **Sign in** — takes you to the sign-in page and saves the pattern to your account for use across any device.

### Editing and Deleting Custom Patterns

In the **My Patterns** section of the library, each custom pattern has three icon buttons:

- **Pencil** — opens the pattern in the editor so you can change its name or strokes.
- **Star** — toggles it as a favourite.
- **Trash** — permanently deletes the pattern. If it was your currently selected pattern, the selection is cleared.

---

## Strum Assistant

The chat control at the right of the top bar. Type what you want and it answers
with a pattern you can preview and open in the strumming machine.

Every request is read by the app itself — nothing you type is sent to a
model. Four kinds of sentence:

- **Chords** — `C Am F G`, `C-G-Am-F`, `Am | F | C | G`. The rhythm is a
  suggestion and says so.
- **A rhythm** — `DUDUDUDU`, `D DU UD`, `下上下上`, with or without chords in
  front of it (`C Am F G, DUDUDU`).
- **A sentence** — `给我一个 C-G-Am-F 的民谣扫弦，慢一点`, `a slow folk strum in
  C G Am F`. A small lexicon reads chords, a style (folk, pop, rock, ballad) and
  a tempo (slower, faster, or a written BPM), and answers only when it read the
  whole sentence.
- **A change to a pattern you have** — `add C G Am F to belief`, `把 belief 改名为
  faith`, `删掉 belief`. Read, shown back to you, and written only when you
  confirm. Shipped patterns take chords and refuse the rest.

A sentence none of that reads is answered with what *was* read and a few
sentences that would have worked, blanks and all — pick one and fill it in.
The model endpoint (`/api/strum-assistant`) is kept for a later, separate job:
answering a vague question with the app's own material behind it.

### Quality baseline

The assistant has an eval set of 34 requests (`src/lib/strumAssistant/__evals__/cases.ts`),
graded programmatically: which path a request takes, which chords come back, how
many bars, the tempo, and whether the model invented a rhythm or reported a word
it could not resolve.

| Path | Cases | Pass | Cost per request | Latency |
| --- | --- | --- | --- | --- |
| chords | 6 | 6/6 | $0 | instant |
| rhythm | 5 | 5/5 | $0 | instant |
| sentence (lexicon) | 10 | 10/10 | $0 | instant |
| model (`claude-opus-5`) | 12 | 12/12 | $0.0065 | 4.4 s mean |

**In the app, every request is answered without a model call**; the offline
half of the set — everything but the `llm` cases — runs in `npm test` and makes
no API calls. The `llm` rows measure the endpoint on its own, for the day it is
wired to a question-answering job: `npm run evals` costs money (about $0.08 for
the set), needs `ANTHROPIC_API_KEY`, and writes
`src/lib/strumAssistant/__evals__/baseline.json` with the pass rate, the
measured cost per request, latency, and how often the repair loop fired.
Compare a prompt edit against that file, not against a feeling. (A thirteenth
model-path case is empty input, which the app never sends, so the runner skips
it.)

Baseline recorded 2026-09-13: 12/12, no repairs. It took two prompt rules to
get there, both found by the set rather than by hand — the model was "fixing" a
chord word it did not recognise into one it did, and its choice between
proposing and asking flipped run to run on a request to change something with
nothing to change.

## Chord Library

Found at **Chords** in the navigation. The Chord Library gives you fingering diagrams for a large collection of guitar chords.

The library lets you:

- Browse chords by **root note** (the letter name of the chord, e.g. C, G, F#).
- Browse by **chord quality** (e.g. major, minor, 7th, maj7, sus4, dim, aug, and many more).
- View **multiple voicings** for each chord — different ways to play the same chord on different parts of the neck.
- See a **fretboard diagram** showing exactly where to place each finger, including barre chord positions.

No account is required to use the Chord Library.

---

## Dashboard — Exercises

The **Dashboard** is your home base for organising practice content. It is divided into two panels: **Exercises** and **Routines**.

### What Is an Exercise?

An exercise is a single thing you want to practise — a scale, a chord, a song, a strumming pattern, and so on. Exercises are the building blocks you assemble into routines.

### Adding an Exercise

1. Click **Add Exercise** at the top of the Exercises panel.
2. A form slides open. Fill in:
    - **Category** — choose the type of exercise from the dropdown (see categories below).
    - **Name** — a short descriptive title, e.g. "C Major Scale" or "G to D chord change".
    - **Description** _(optional)_ — any notes you want to see during a session.
3. Click **Add** (or press Enter after typing the name).

**Exercise categories:**

| Category     | Use it for                                     |
| ------------ | ---------------------------------------------- |
| Chord        | Practising an individual chord shape           |
| Chord Change | Switching smoothly between two chords          |
| Picking      | Fingerpicking patterns                         |
| Scale        | Running a scale up and down the neck           |
| Strumming    | Strumming patterns and rhythm work             |
| Fingering    | Finger independence and dexterity exercises    |
| Ear Training | Identifying notes, intervals, or chords by ear |
| Arpeggio     | Playing the notes of a chord one at a time     |
| Theory       | Music theory study                             |
| Song         | Practising a full piece or a section of one    |

### Filtering Exercises

Once you have several exercises, a **category filter bar** appears above the list. Click a category pill to show only exercises in that category. Click **All** to clear the filter.

### Deleting an Exercise

Click the **trash icon** on any exercise row. If the exercise is part of one or more routines, a warning appears showing which routines will be affected. Click **Delete anyway** to confirm, or **Cancel** to keep it.

---

## Dashboard — Routines

A **routine** is an ordered list of exercises with a set time for each one. When you start a routine, Guitar Pal guides you through each exercise in sequence with a countdown timer.

### Creating a Routine

1. Click **New Routine**.
2. Enter a name (e.g. "Morning Warmup" or "Beginner Fundamentals").
3. Click **Create**.

The routine appears in the list with no exercises in it yet.

### Adding Exercises to a Routine

1. Click the **pencil icon** on a routine to open the edit dialog.
2. In the **Add exercise** section at the bottom:
    - Choose a **category** from the first dropdown.
    - Choose a specific **exercise** from the second dropdown (it only shows exercises in the selected category).
    - Enter a **duration** in minutes.
3. Click **Add**.

Repeat for as many exercises as you like.

### Editing a Routine

In the edit dialog, each exercise row shows:

- **Duration field** — click the number and type a new duration in minutes. The change is saved when you click away.
- **Up / Down arrows** — reorder exercises within the routine.
- **Trash icon** — remove the exercise from the routine (does not delete the exercise itself).

### Previewing a Routine

Click the routine's name row in the dashboard list to expand it and see a summary of all its exercises and their durations.

### Starting a Session

Click the **Start** button on any routine to begin a timed practice session.

### Deleting a Routine

Click the **trash icon** on the routine row. This deletes the routine but leaves all of your exercises intact.

---

## Practice Sessions

A practice session is a guided, timed run-through of one of your routines. Navigate to it by clicking **Start** on any routine in the dashboard.

### The Session Screen

At the top of the screen, a thin progress bar fills from left to right as you work through the routine's exercises.

The header shows:

- The routine name.
- Which exercise number you are on (e.g. "Exercise 2 of 5").
- A running clock showing your **total time** in the session.

The main area shows:

- A **category badge** for the current exercise.
- The **exercise title** in large text.
- The **description** (if you added one when creating the exercise).
- A large **countdown timer** showing how much time is left for this exercise.

### Timer Controls

- **Play** — starts the countdown.
- **Pause** — pauses the countdown. Click Play again to resume.
- **Reset** _(circular arrow)_ — restarts the countdown for the current exercise from its full duration.
- **+30s / −30s** — add or remove 30 seconds on the fly without stopping the timer. Useful if you want a little more time on a tough exercise.
- **Skip** _(forward arrow)_ — skips the current exercise and jumps immediately to the next one.

When the timer reaches zero, it freezes and shows **"Time's up!"**. You can then hit Play to restart the same exercise with a fresh timer, or Skip to move on.

A preview card at the bottom of the screen shows the name, category, and duration of the **next exercise** so you can prepare.

### Completing a Session

After the last exercise ends, the **Session complete!** screen appears. It shows:

- Your **total time** for the session.
- The **number of exercises** you completed.

You can optionally:

- Give the session a **star rating** from 1 to 5 — how did it feel?
- Write **notes** about how the session went (what was hard, what improved, what to focus on next time).

Then choose one of:

- **Save session** — saves the log to your account and returns you to the dashboard. (A rating is required to enable this button.)
- **Skip & Exit** — goes back to the dashboard without saving.
- **Repeat this routine** — restarts the session from the beginning.

---

## Account & Data Sync

### Signed-In Accounts

When you are signed in, everything is saved to the cloud:

- Custom strum patterns and favourites.
- Exercises and routines.
- Practice session logs.

Your data is available on any device — phone, tablet, or computer.

### Without an Account

You can use the Strumming Machine without signing in. Custom patterns and favourites you create will be saved to your browser's local storage, meaning they are tied to this specific browser on this specific device.

### Signing Out

Click **Log Out** in the top navigation bar. Your data remains safely stored in your account for next time.

---

## Tips for Getting the Most Out of Guitar Pal

- **Start slow.** Set the BPM lower than you think you need. Clean technique at 60 BPM is far more valuable than sloppy playing at 120.
- **Use Play once.** When first learning a pattern, enable Play once so you hear it once, then try it yourself in the silence that follows.
- **Build your routines intentionally.** A good routine moves from technical warmups (scales, chord changes) to creative work (songs, full patterns). Keep sessions realistic — even 20 focused minutes beats an hour of unfocused noodling.
- **Rate every session honestly.** The star rating helps you spot patterns over time — if you always rate chord changes at 2 stars, that tells you where to focus.
- **Use the notes field.** A short note after each session ("G chord still buzzing on string 3, try thumb position") is worth far more six weeks later than you might expect.

---

## Deployment (self-hosted)

Production runs on a single Tencent Cloud HK VPS (Ubuntu, 2 GB) at `https://guitarpal.sloanwan.com`: Nginx on the host terminates TLS and reverse-proxies to one Docker container running the Next.js standalone server. A second container, `book-service` (Python, see [`book-service/README.md`](book-service/README.md)), sits behind it on the compose network for textbook import. Database, auth and file storage stay on hosted Supabase — nothing stateful lives on the box, so it can be rebuilt from scratch with the steps below.

### Files

| File | Role |
|---|---|
| `Dockerfile` | `node:22-alpine`, three stages: `npm ci` → `next build` → copy `.next/standalone` + `.next/static` + `public` |
| `docker-compose.yml` | `web` bound to `127.0.0.1:3000` (fills the two `NEXT_PUBLIC_SUPABASE_*` build args) and `book-service` with no host port; both load runtime secrets from `.env` |
| `book-service/Dockerfile` | `python:3.12-slim`, dependencies from `pyproject.toml`, `uvicorn` on port 8000 |
| `scripts/server-setup.sh` | One-time bootstrap: swap, Docker, Nginx (rate-limited reverse proxy), Let's Encrypt via the certbot nginx plugin |
| `.github/workflows/deploy.yml` | Push-to-deploy: after CI passes on `main`, SSH in, `git reset --hard origin/main`, `docker compose up --build -d` |

### Environment variables

`NEXT_PUBLIC_*` values are inlined into the client bundle at `next build`, so they are Docker **build args**; everything else is server-only and injected at **runtime**. All of it comes from one file on the server, `~/dev/guitar-pal/.env`, which is never committed and which both containers read:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
ANTHROPIC_API_KEY=sk-ant-...

# book-service
BOOK_SERVICE_DATABASE_URL=postgresql://book_service:<password>@<pooler host>:6543/postgres
# Only for a legacy project that still signs sessions with a shared secret
# (Dashboard → Settings → API → JWT Secret). Projects on asymmetric signing
# keys leave it unset; the service verifies against the project's JWKS.
SUPABASE_JWT_SECRET=<jwt secret>
```

Do **not** set `NEXT_PUBLIC_ENABLE_DEV_ROUTES` on the server — `src/proxy.ts` and `src/app/dev/layout.tsx` hide `/dev` unless it is `"1"`. `SUPABASE_SERVICE_ROLE_KEY` is only needed by one-off scripts and stays off the server: the book-service reads Storage with the player's own session token, and its database role can reach nothing but its own tables. The migration URL (an admin role, direct connection on port 5432) is passed to `alembic` by hand and is not in `.env` — see the service README.

### First-time setup

1. **DNS** — A record `guitarpal.sloanwan.com` → the server's public IP. Wait until it resolves; certbot validates the domain over HTTP.
2. **Security group** — allow inbound TCP 22, 80, 443.
3. **Bootstrap** (as the `ubuntu` user):

    ```bash
    git clone https://github.com/SloanWan/guitar-pal.git ~/dev/guitar-pal
    cd ~/dev/guitar-pal
    nano .env                      # the three variables above
    bash scripts/server-setup.sh   # idempotent; re-run if it stops midway
    exit                           # re-login so the docker group applies
    cd ~/dev/guitar-pal && docker compose up --build -d
    ```

    The first build takes a few minutes on 2 GB — the script adds a swapfile for exactly that reason.

4. **Supabase Auth** — Dashboard → Authentication → URL Configuration:
    - Site URL: `https://guitarpal.sloanwan.com`
    - Redirect URLs: add `https://guitarpal.sloanwan.com/**` (covers the password-reset return to `/auth/reset`).
5. **Book service database** — in the Supabase SQL editor run `scripts/create-book-service-role.sql` (set a real password first) and `scripts/create-books-bucket.sql`, then apply the service's migrations from any machine that can reach the database:

    ```bash
    cd book-service && pip install -e .
    BOOK_SERVICE_MIGRATION_DATABASE_URL='postgresql://postgres.<project-ref>:<db password>@aws-0-<region>.pooler.supabase.com:5432/postgres' alembic upgrade head
    ```

    That is the **session pooler** string from Dashboard → Settings → Database (port 5432, user `postgres.<ref>`). The direct `db.<project>.supabase.co` host is IPv6-only on the free tier and usually unreachable from a home network.
6. **Deploy key + GitHub secrets** — on the server:

    ```bash
    ssh-keygen -t ed25519 -N "" -C github-deploy -f ~/.ssh/github-deploy
    cat ~/.ssh/github-deploy.pub >> ~/.ssh/authorized_keys
    cat ~/.ssh/github-deploy      # → repository secret DEPLOY_SSH_KEY
    ```

    Repository secrets (Settings → Secrets and variables → Actions): `DEPLOY_HOST` (IP or hostname), `DEPLOY_USER` (`ubuntu`), `DEPLOY_SSH_KEY` (the private key above).

### Day-to-day

- **Deploy** — merge to `main`. CI runs; if it is green, the Deploy workflow rebuilds the container and smoke-tests the site. It can also be re-run by hand from the Actions tab.
- **Logs** — `docker compose logs -f web` / `docker compose logs -f book-service`
- **Roll back** — `git checkout <sha> && docker compose up --build -d`; the next push to `main` moves it forward again.
- **Certificate** — renews automatically through `certbot.timer`; `sudo certbot renew --dry-run` checks the setup.
- **Change a `NEXT_PUBLIC_*` value** — edit `.env`, then `docker compose up --build -d` (the value is baked at build time, a restart is not enough).
