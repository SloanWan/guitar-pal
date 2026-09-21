# What the assistant reads

The Strum and Tab modes of the assistant read sentences by rules, with no model. This is the grammar those rules understand, written down so a player can find out what to type and so the tool descriptions in `src/lib/assistant/general/tools.ts` have something to stay consistent with. The General mode hands the player's sentence, word for word, to these same readers, so everything here holds there too.

The code is the source of truth. Each section names the file that reads it; when this page and the code disagree, fix one of them.

Two rules run through everything:

- **A sentence is read whole or not at all.** Every reader strips what it understood and looks at what is left. Filler ("give me", "please", "a bit") is ignored, but one word the reader cannot place ("C G Am F but dreamy") means the sentence was not read. The reply then says what *was* read and offers sentences that would have worked.
- **Nothing is saved on the strength of a sentence.** A request becomes a card the player confirms; an edit says what it would change and waits.

Language follows the message: a sentence with Chinese characters in it is answered in Chinese, anything else in English. Chord letters and notation carry no language. The readers take Chinese sentence forms as well; this page lists the English ones, and the Chinese page, from the switch above, lists those.

## Read before anything else, in both modes

These run first, in this order, on the whole message.

**Small talk** (`smallTalk.ts`). "hi", "thanks", "what can you do" — whole-message matches only — get a line back and the starter sentences. They are never read as requests.

**Chord questions** (`chordAsk.ts`). A question about how chords are played is answered with their shapes, on either page:

| Ask |
| --- |
| `how do I play F#m7` |
| `show me C Am F G` |
| `F chord`, `Cmaj7 fingering`, `C G Am F chord shapes` |
| `what's the shape for Bb` |

Every word in the run has to be a chord the library holds under that exact name; one it does not know makes the question a miss, not an answer about the rest. A bare `play C G` is not a question — on the strum page that is a request for a pattern.

**Typos** (`fuzzy.ts`). Words the readers know — style words, tempo words, edit verbs, `strum`, `pattern`, `capo`, `string`, `fret`, the meter and note-value words — are corrected by edit distance before reading: one character wrong in a word of five or six letters, two in a longer one. Four-letter words are only corrected when they are `string`/`fret` with digits behind them, so "slow" never becomes "show". Chord names and the player's own pattern names are never corrected. The reply owns up to it: *Took "travs" as "travis".*

## Clauses both modes share

These are read the same way in Strum and Tab (`strum/readPhrase.ts`, `strum/readCapo.ts`) and blanked out of the sentence before anything else reads it.

**Tempo.** A written tempo is taken literally: `92 bpm`, `at 92 bpm`. Two or three digits.

**Name.** What the new pattern should be called: `name it test`, `call it sunday`, `call this X`, `named X`, `name: X`. Quotes are optional (`call it "sunday"`). The name runs to the next punctuation mark, at most 40 characters; a trailing "pattern" is dropped. A chord word inside a name is part of the name (`call it C jam`).

**Capo.** `capo 2`, `capo on 2`, `capo at the 4th fret`, `capo on fret 2`, `2nd fret capo`. `no capo` and `without a capo` mean fret 0. Frets 0 to 12; `capo 15` is not a capo and is left unread. A capo belongs to a progression — with no chords to transpose it is dropped and the reply says so.

## Strum

Read by `strum/router.ts`, `strum/readPhrase.ts`, `strum/parseRhythm.ts` and `strum/editIntent.ts`, in this order: an edit sentence, then a strict chord/rhythm line, then a sentence read by the lexicon.

### A chord line

Chord words separated by spaces, commas, pipes or dashes. Every word has to resolve through the same ranked search the chord picker uses, or the line is not a chord line.

```
C Am F G
c am f g
C-G-Am-F
Am | F | C | G
C/G G/B Am7 Fmaj7
D# Gb A#m          → stored as Eb F# Bbm
```

A bare number is never a chord. A word nothing matches (`C Am Zq F`) fails the line; the reply reports the word rather than dropping it.

A chord line alone is a progression over the default rhythm, Old Faithful (`D DU UD`), and the card says the rhythm was guessed.

### Rhythm notation

One character per cell, the same notation `patternNotation` writes. A space is a blank cell, not a separator.

| Written | Cell |
| --- | --- |
| `D` `d` | down |
| `U` `u` | up |
| `X` `x` | mute |
| space, `.`, `-`, `_`, `·` | blank (not struck) |
| `\|` | bar line |

```
D DU UD
DUDUDUDU
D-DU-UDU           → D DU UDU
D DU UD|D DU UDU
```

Bars are four beats. The cell count picks the subdivision: up to 4 cells is one per beat, up to 8 is eighths, up to 12 triplets, up to 16 sixteenths, up to 24 sextuplets; more than 24 is an error ("split bars with `|`"). Later bars follow the first bar's subdivision. A bar with fewer cells than the grid is padded with blanks and flagged. Trailing blanks are dropped. There is no meter word in strum — a bar is 4/4 here; other meters are set in the pattern editor.

Ghost strokes are never written: what is typed is what is stored, and the travelling hand is drawn from the struck cells.

Write bars tight against the `|`: a space beside it is a cell, so `D DU UD | D DU UDU` gives the second bar nine cells and it overflows.

### Chords and rhythm on one line

Segments are split at `,`, `;` and line breaks. Every segment has to be a chord line or a rhythm, and there may be one rhythm at most. Chords win ties: a lone `D` is the chord.

```
C Am F G, DUDUDUDU    → one bar of that rhythm per chord
DUDU, UDUD            → two rhythms is a sentence, not a pattern: not read
```

### A sentence

When the strict line fails, the lexicon reads the sentence — and only whole. It takes:

- **A chord run**: at least two chords standing together, joined by spaces, commas, dashes, `→`, `>` or `|`. A single chord elsewhere in the sentence (`folk in the key of C`) is a stray and leaves the sentence unread — a key is not a progression, and a capital A may be the article.
- **Rhythm written out**: a run of notation words with at least two struck cells, unless every word is itself a chord (`D D D` is chords).
- **A style word**, which chooses a rhythm and a tempo. The rhythm is flagged as a guess.

  | Word | Rhythm | BPM |
  | --- | --- | --- |
  | `folk` | `D DU UD` | 80 |
  | `pop` | `D DU UD` | 95 |
  | `rock` | `D DU UDU` | 110 |
  | `ballad` | `D DU UD` | 65 |

- **A tempo word**: `slower`, `slowly`, `slow`; `faster`, `fast`, `quick`, `upbeat`. It moves the style's tempo (or the default, 80) by 15%, rounded to the nearest 5. A written tempo wins over the word; both words at once is a sentence, and unread.
- **Tempo, name and capo** as above.

Filler is dropped: `give me`, `i want`, `i'd like`, `can you`, `can i have`, `please`, `make it`, `make`, `something`, `strumming`, `strum`, `pattern`, `progression`, `chords`, `chord`, `tempo`, `a bit`, `a little`, `little`, `bit`, `more`, `and`, `with`, `for`, `the`, `in`, `at`, `of`, `me`, `it`, `an`, `a`, `some`.

```
give me a slow folk strum in C G Am F  → C G Am F, D DU UD (guessed), 70 bpm
fast rock, C G D                       → D DU UDU at 125
C G Am F at 92 bpm
D DU UD in 140 bpm, name it test
C G Am F, capo 2
```

Not read, because a word is left over or a meaning is missing: `folk in the key of C` (a key, not chords), `something like Wonderwall`, `C G Am F but dreamy`, `a waltz in 3/4, C G7` (no meter words in strum), `slower` alone (nothing to slow), `DUDUDUDU but muted on 2 and 4`.

### Edit sentences

An edit names one of the player's own patterns and says what to do to it. It is read before the chord line, so `add C G to belief` is an edit and not a three-chord progression. Three parts, in any order:

**The verb.**

| Op | Words |
| --- | --- |
| attach chords | `add`, `append`, `attach`, `put` |
| rename | `rename`, `call` |
| delete | `delete`, `remove` |

`call` only reads as a rename when a pattern of the player's is in the sentence; otherwise `call it X` is a name for something new.

**The target.** A pattern name from the player's library, matched whole and case-insensitively; the longest name that fits wins (`add C G to old faithful` is not an edit to `old`). Names of one character are not searched for. Quotes and the words around a name are fine: `the belief pattern`, `"summer"`.

When no pattern of the player's is named, the name the sentence seems to aim at — after `to`, `into`, `onto` or `in`, or in quotes — is reported, and the player is asked which pattern they meant.

**The chords** (attach only). Any word shaped like a chord, whether or not the library has it: `Em9`, `C#`, `F#m7`, `Cmaj7#11`, `G7b9`. Lowercase is read here (`add c am f g to on the beat`), except that a single lowercase letter on its own is ignored (`add a progression to belief`). `and`, `then` and `plus` join a list. A short unknown word between two chords is carried along as a chord the player meant, and shown in red (`C G AM RM F C` keeps `RM` in its place). A word the library has nothing for is shown in red, never dropped.

**The new name** (rename): after `to` or `as`. A rename with no new name asks for one.

```
add C G Am F to belief
add Em9 D C# F#m7 to belief
add C G Am F to belief with capo 2
add C and G to belief
rename belief to faith
delete belief
remove the wonderwall pattern
```

A delete takes the whole pattern and every progression on it. A sentence that names chords or says "progression" (`delete the C G Am F progression from belief`) wants one progression gone, and is refused with a pointer to the progressions tab. Shipped patterns cannot be renamed or deleted.

## Tab

Read by `tab/router.ts`, `tab/readTabSentence.ts`, `tab/parsePickOrder.ts` (on top of `fingerpickPickSequence.ts`), `tab/parseStringFret.ts`, `tab/parseAsciiTab.ts`, `tab/styles.ts` and `tab/editIntent.ts`. An edit sentence is read first; then a pasted tab; then the sentence. Frets always come from the chord's shape in the library or from the sentence — the reader never invents them.

### A chord with a pick order

Chord words, then the right-hand order. The colon is optional.

```
Am: 5 3 2 1 3 2 1 3
C G: R_32^132R_32^132
C: 6(32)1(32)
C: 5/4 2 1 3
```

The order's tokens (`fingerpickPickSequence.ts`, `tab/parsePickOrder.ts`):

| Token | Meaning |
| --- | --- |
| `1` – `6` | a string, 1 = high e, 6 = low E |
| `R`, `r` | the root: the thumb on whichever string the chord's root sits on, so one order follows the chord change |
| `0`, `-` | a rest |
| `_`, `^` | a hold: the cell before it keeps sounding one cell longer. Needs a note before it |
| `( … )` | a pinch: strings plucked together, `(32)`, `(R1)` |
| `5/4`, `6/4`, `6/5` | an alternating bass: the thumb takes the first string this time and the second the next. The order is written out twice, so `5/4 2 1 3` is `5 2 1 3 4 2 1 3` |

Spaces are optional between tokens. A run needs at least two cells and at least one pluck; a lone digit is a fret, a count, anything, and is not an order.

**Note value.** Eighths unless said otherwise: `/16`, `16ths`, `sixteenths`; `/8`, `eighths`. (`/4` is not read as a value — `5/4` is a thumb.) When no value is named and the order has more cells than a bar of eighths, and they divide the bar evenly into a plain value, it is one bar of that value: sixteen cells are a bar of sixteenths. Twelve cells stay eighths and run into a second bar.

**Filling the bar.** An order shorter than a bar that divides it evenly is repeated to fill it — `5 3 2 1` is the arpeggio, not half a bar of it. Anything else is padded with rests where it ends, and the card says so. A hold lengthens the note before it when the longer note is a plain value that stays inside its beat, or covers whole beats from a place its own size divides; across a beat line or a bar line it is written as a tied note.

**One pass per chord.** The order is written once over each chord word, in order: `C G: …` is two bars. A string the chord's shape leaves out is written as a dead note and reported. No chord at all writes open strings and says so.

### Chords alone, or a style word

A chord line with no order is picked as an arpeggio, flagged as a guess, with the usual orders offered under it (`53231323`, `R3231323`, `R323`, `R3(12)3`). A style word picks a shipped pattern's first bar instead and lays it over each chord:

| Words | Pattern |
| --- | --- |
| `travis picking`, `travis` | Travis |
| `arpeggio`, `arpeggios`, `arpeggiated` | Arpeggio |
| `waltz` | Waltz (3/4) |
| `celtic fingerstyle`, `celtic` | Celtic |

```
C G Am F
travis picking in Am
waltz in C
```

The shipped song preset is a melody, not a style, and has no word.

### Meter

`3/4`, `6/8`, `in 12/8`, `3/4 time`. Only the meters the app supports are read — 4/4, 3/4, 2/4, 6/8, 12/8 — so `5/4` inside an order is a thumb. The meter decides how many cells make a bar.

```
Em: R 3 2 1 2 3 in 3/4
Am: R 3 2 3 2 1 in 6/8
```

### Strings and frets written out

Two lists, one string number per fret, in either order; each pair is one bar.

```
string:66544322, fret:8-11-10-8-10-8-8-11
Am string:654 fret:x-0-2
string:654 fret:0-2-2 /16
```

- The keyword is `string` or `strings`; `fret` or `frets`. The colon is optional.
- Strings are single digits, run together or separated by spaces, commas or dashes.
- Frets are a separated list (`8-11-10-8`) or run together, one digit each, with a two-digit fret in parentheses: `5768(11)(12)`. `x` is a dead note. A bare two-digit group up to 24 is one fret (`fret:11`); higher than the neck, it can only have meant two.
- The two lists must be the same length, or the reply says which bar is off and by how much.
- A bar shorter than the meter is padded with rests; one that runs over is split. Several pairs in one message are several bars, in the order written, so a phrase can be typed bar by bar.
- A chord word before the lists marks the bar; the frets are still the ones written.

### ASCII tab

Six consecutive lines of tab are read as an import, with the rhythm inferred from the spacing.

```
e|-----0-----0-|
B|---1-----1---|
G|-0-----0-----|
D|-------------|
A|-------------|
E|-0-----0-----|
```

- A line is tab when it has two dashes together somewhere. The string letter and the opening `|` or `:` are optional. High e on top is the default; `E` on top with `e` at the bottom is read the other way up.
- `|` or `:` are bar lines. Digits are frets (two digits are one fret). `x` is a dead note.
- Techniques: `h` hammer-on, `p` pull-off, `/` or `s` slide up, `\` slide down, `t` tapping, before the note; `b` bend and `~` vibrato after it. Any other mark is skipped with a warning.
- A bar's width in characters is its length; the distance from one note to the next is how long it lasts. A width that does not divide the bar evenly is rounded to the nearest note value and flagged. Notes past the end of the bar are dropped and flagged.
- The lines around the tab are read for a name, a tempo and a meter only (`name it lick, 3/4, 90 bpm`); anything else there, a title say, is left alone rather than read as a request.

### Chord words in a sentence

Every chord word has to be one the library holds under that exact name. Lowercase is fine (`am`, `g7`, `c`); a lone `a` is the article unless a colon follows it (`a: 5321`). A word spelled like a chord that the library does not have keeps its bar, written as rests, and the reply names it.

Filler is dropped as in strum, plus `fingerpicking`, `fingerpick`, `fingerstyle`, `picking`, `pick`, `over`, `on`, `style`. Anything else left over means the sentence was not read: `something gentle in Em` is a feel, and a miss.

### Edit sentences

An edit names one of the player's fingerpicking patterns and what to write into it. The bars it writes are typed the same way a new pattern is, built to the target's meter. Segments of a spec are split at `;` and line breaks. Presets cannot be edited in place: an edit to one becomes a copy named "… (mine)", and once that copy exists the shipped name means the copy.

**Append bars**: `add to NAME: SPEC`, `append a bar to NAME: SPEC`.

```
add to travis: string:6654, fret:8-11-10-8; Am: 5 3 2 1
add to my arp: travis in C
```

**Replace a bar**: `replace bar N of NAME: SPEC` (also `set`, `change`, `rewrite`; `in`/`on`; `to`/`with` in place of the colon). Bars are counted from 1.

```
replace bar 2 of travis: C: 5/4 2 1 3
set bar 1 in my arp to travis in C
```

**Chord marks** on bars that are already there. A bar or a range, a beat (counted as the player counts) or a slot (the grid's own numbering, which wins over a beat), and the chords:

```
add chord Am to bar 2 beat 3 of travis
mark C G Am F on bars 1-4 of lick
add Am to measure 1 slot 3 of lick
lick bar 2 beat 3: Am
chords for lick bars 1-4: C G Am F
in lick, add Cm7 to bar 1, add F7 to bar 2 beat 3
add Am7, D7, Gm7 to bars 2-4 of lick
```

The beat is the first unless one is named. One chord over a range marks every bar in it; several chords go one per bar, and the range has to be at least as long as the list — or absent, in which case the list sets it. Fewer chords than bars in the range: the last chord holds through the rest, the way a lead sheet reads.

**Rename**: `rename NAME to NEW`, `rename NAME as NEW`. `rename NAME` alone asks for the new name.

**Delete**: `delete NAME`, `remove the NAME pattern`.

**Tempo or meter**: `set NAME to 90 bpm`, `NAME at 72 bpm`, `change NAME to 3/4`, `set NAME to 3/4 at 80 bpm`. The value is a number, a tempo, a meter, or a meter and a tempo. A meter change is the same refit the editor's meter dropdown does, and the reply lists the bars that would lose notes.

**The target.** The name as written, case-insensitive, with `the`, `my` and `pattern` around it ignored; a name in quotes is fine. When no pattern has that exact name, patterns whose names contain it are tried: `travis` finds "Travis Picking", `arp` finds both "my arp" and "Arpeggio" and asks which.

## Choosing a mode

The mode chip is the player's: a new thread opens in the current page's mode and stays there until the player switches it. The readers never pick a domain from the sentence. The one safety net (`readAs.ts`): when the chosen mode's readers made nothing of a sentence and the other mode's readers read it whole — including an edit that names a pattern the other page has — the reply offers *Read as Tab/Strum instead*.

## Where this is checked

- Offline, on every `npm test`: `strum/__tests__`, `tab/__tests__`, `__tests__/chordAsk.test.ts`, `__tests__/fuzzy.test.ts`, and the router cases in `__evals__/cases.ts` through `__evals__/offline.test.ts`.
- With a model, on `npm run evals`: `__evals__/cases.ts` and `__evals__/tabCases.ts`, which assert that the General assistant reaches for `read_*` / `edit_*` on the sentences above rather than composing them.
- The descriptions in `general/tools.ts` quote examples from this page; when a token or a sentence form is added here, check them.
