<p align="center">
  <img src="public/guitar-pal-logo-mark.svg" width="72" alt="" />
</p>

<h1 align="center">Guitar Pal</h1>

<p align="center">
  A practice studio for guitarists who would rather play than squint at PDFs.<br/>
  <a href="https://guitarpal.sloanwan.com"><b>guitarpal.sloanwan.com</b></a>
</p>

https://github.com/user-attachments/assets/<video-id>

## What's inside

**Strum machine.** Build a rhythm, write chords over it, and hear it played on a
real guitar sample. The strings keep ringing into the next strum, so it sounds
like a guitar, not a drum machine with opinions.

**Fingerpick tabs.** Write a tab, play it back, loop the hard bar. Triplets, 6/8,
hammer-ons and slides all play, and every fret can show the note it sounds.

**Books.** Upload a guitar method PDF, scanned pages included. Guitar Pal finds
the chapters, reads the exercises off the page, and gives them back as drafts
you can check, fix and save as playable patterns.

**Chord library.** Hundreds of chords with several voicings each, and yes,
somebody checked the bass notes.

**Assistant.** Type `C G Am F, slow folk strum` or paste an ASCII tab and get
back a card you can press play on. Most of it is read by plain rules, not a
language model. The rules it follows are written down in
[docs/assistant-grammar.md](docs/assistant-grammar.md).

**Share links.** Send someone a pattern. They can play it without signing up.

Everything works without an account. Signing up just means your stuff is still
there tomorrow.

## Standing on

- [VexFlow](https://github.com/0xfe/vexflow): draws every tab stave
- [WebAudioFont](https://github.com/surikov/webaudiofontdata): the guitar samples, fetched at runtime
- [chords-db](https://github.com/tombatossals/chords-db): the chord voicings, audited and corrected here

## About this repo

This is the source of [guitarpal.sloanwan.com](https://guitarpal.sloanwan.com).
It is not set up for self-hosting: the database schema and chord data are not
included.
