Total spend: $5.25 over 153 runs.

### Compose a fingerpicking tab (propose_tab)

| model | n | valid 1st try | valid after repair | failed / no call | calls/run | task score | meter | bpm | chords | bass root b.1 | tone fit | thumb pattern | form | techniques | spend |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 21 | 21 | 0 | 0 | 1.2 | 99% | 100% (21) | 100% (21) | 100% (18) | 100% (18) | 94% (18) | 100% (6) | 100% (3) | 100% (3) | $0.05 |
| claude-opus-5-5 | 21 | 21 | 0 | 0 | 1.0 | 100% | 100% (21) | 100% (21) | 100% (18) | 100% (18) | 100% (18) | 100% (6) | 100% (3) | 100% (3) | $1.67 |
| claude-sonnet-5-5 | 21 | 21 | 0 | 0 | 1.0 | 100% | 100% (21) | 100% (21) | 100% (18) | 100% (18) | 100% (18) | 100% (6) | 100% (3) | 100% (3) | $0.68 |

Per case (runs fully correct = valid and every applicable check passed):

| case | claude-haiku-5-5 | claude-opus-5-5 | claude-sonnet-5-5 |
|---|---|---|---|
| tab-68-am-f-c-g | 3/3 | 3/3 | 3/3 |
| tab-travis-g-c-d | 3/3 | 3/3 | 3/3 |
| tab-techniques-em | 3/3 | 3/3 | 3/3 |
| tab-zh-34-c-am-dm-g | 3/3 | 3/3 | 3/3 |
| tab-capo2-em-c-g-d | 3/3 | 3/3 | 3/3 |
| tab-12bar-blues-128 | 2/3 | 3/3 | 3/3 |
| tab-bossa-16th | 3/3 | 3/3 | 3/3 |

Runs that missed a check:

- claude-haiku-5-5 tab-12bar-blues-128 r3: failed toneFit (gotBpm=70 gotMeter="12/8" bars=12 chordLabels=["A7","A7","A7","A7","D7","D7","A7","A7","E7","D7","A7","E7"] links=[])

### Compose a strumming pattern (propose_strum)

| model | n | valid 1st try | valid after repair | failed / no call | calls/run | task score | bpm | chords | capo | rhythm asked | form | says 4/4 | spend |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 18 | 18 | 0 | 0 | 1.0 | 100% | 100% (15) | 100% (18) | 100% (3) | 100% (18) | 100% (3) | — | $0.01 |
| claude-opus-5-5 | 18 | 18 | 0 | 0 | 1.1 | 100% | 100% (15) | 100% (18) | 100% (3) | 100% (18) | 100% (3) | — | $0.29 |
| claude-sonnet-5-5 | 18 | 18 | 0 | 0 | 1.6 | 98% | 100% (15) | 89% (18) | 100% (3) | 100% (18) | 100% (3) | — | $0.22 |

Per case (runs fully correct = valid and every applicable check passed):

| case | claude-haiku-5-5 | claude-opus-5-5 | claude-sonnet-5-5 |
|---|---|---|---|
| strum-campfire-c-g-am-f | 3/3 | 3/3 | 3/3 |
| strum-zh-folk-c-g-am-f | 3/3 | 3/3 | 3/3 |
| strum-capo3-16th | 3/3 | 3/3 | 3/3 |
| strum-chucks-am-dm-e | 3/3 | 3/3 | 3/3 |
| strum-beginner-downs | 3/3 | 3/3 | 3/3 |
| strum-verse-chorus-form | 3/3 | 3/3 | 1/3 |

Runs that missed a check:

- claude-sonnet-5-5 strum-verse-chorus-form r2: failed chords (gotBpm=100 gotChords=["C","D","G","G"] gotCapo=0 gotRhythm="D DU UDU" links=2)
- claude-sonnet-5-5 strum-verse-chorus-form r3: failed chords (gotBpm=100 gotChords=["C","D","G","G"] gotCapo=0 gotRhythm="D DU UDU" links=2)

### Probe: a 6/8 strum (propose_strum writes 4/4 only; not in the task scores above)

| model | n | reply says the strum tool is 4/4-only | wrote a 6/8 tab instead | wrote a 4/4 strum | no link |
|---|---|---|---|---|---|
| claude-haiku-5-5 | 3 | 3 | 2 | 1 | 0 |
| claude-opus-5-5 | 3 | 3 | 3 | 0 | 0 |
| claude-sonnet-5-5 | 3 | 3 | 3 | 0 | 0 |

### Read a tab image (import_tab), scored by book-service/evals/tab/score.py

| case | model | n | valid 1st try | valid after repair | failed | note_f1 | note_precision | note_recall | fret_f1 | rhythm | link_f1 | effect_f1 | span_f1 | pick_down_f1 | hammer_f1 | tie_f1 | slide_f1 | vibrato_f1 | palm_mute_f1 | chords_placed | bars | spend |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| read-a-blues | claude-haiku-5-5 | 3 | 2 | 0 | 1 | 57% [44/50/78] | 57% [44/50/78] | 57% [44/50/78] | 74% [78/67/78] | 58% [58/58/58] | 33% [0/0/100] | 5% [0/0/15] | 79% [75/88/75] | 0% [0/0/0] | 33% [0/0/100] | — | — | 33% [0/0/100] | 79% [75/88/75] | 44% [0/67/67] | 100% [100/100/100] | $0.02 |
| read-a-blues | claude-opus-5-5 | 3 | 3 | 0 | 0 | 85% [89/100/67] | 85% [89/100/67] | 85% [89/100/67] | 100% [100/100/100] | 100% [100/100/100] | 67% [100/100/0] | 90% [87/96/87] | 100% [100/100/100] | 95% [95/95/95] | 67% [100/100/0] | — | — | 33% [0/100/0] | 100% [100/100/100] | 100% [100/100/100] | 100% [100/100/100] | $0.34 |
| read-a-blues | claude-sonnet-5-5 | 3 | 2 | 1 | 0 | 100% [100/100/100] | 100% [100/100/100] | 100% [100/100/100] | 100% [100/100/100] | 100% [100/100/100] | 100% [100/100/100] | 15% [15/15/15] | 100% [100/100/100] | 0% [0/0/0] | 100% [100/100/100] | — | — | 100% [100/100/100] | 100% [100/100/100] | 100% [100/100/100] | 100% [100/100/100] | $0.24 |
| read-e-blues | claude-haiku-5-5 | 6 | 1 | 2 | 3 | 39% [31/28/55/62/14/41] | 46% [31/71/55/62/14/41] | 37% [31/17/55/62/14/41] | 61% [41/39/100/97/21/69] | 51% [31/24/100/93/0/55] | 6% [0/0/0/17/17/0] | 0% [0/0/0/0/0/0] | — | 0% [0/0/0/0/0/0] | 8% [0/0/0/25/25/0] | 0% [0/0/0/0/0/0] | 0% [0/0/0/0/0/0] | 0% [0/0/0/0/0/0] | — | 33% [0/0/100/0/100/0] | 83% [100/0/100/100/100/100] | $0.03 |
| read-e-blues | claude-opus-5-5 | 6 | 6 | 0 | 0 | 90% [100/100/45/100/93/100] | 90% [100/100/45/100/93/100] | 90% [100/100/45/100/93/100] | 100% [100/100/100/100/100/100] | 100% [100/100/100/100/100/100] | 88% [100/100/38/100/88/100] | 97% [98/100/93/98/93/98] | — | 98% [98/100/98/98/98/98] | 83% [100/100/0/100/100/100] | 100% [100/100/100/100/100/100] | 67% [100/100/0/100/0/100] | 67% [100/100/0/100/0/100] | — | 100% [100/100/100/100/100/100] | 100% [100/100/100/100/100/100] | $0.64 |
| read-e-blues | claude-sonnet-5-5 | 6 | 6 | 0 | 0 | 81% [45/48/93/100/100/100] | 81% [45/48/93/100/100/100] | 81% [45/48/93/100/100/100] | 100% [100/100/100/100/100/100] | 100% [100/100/100/100/100/100] | 77% [38/38/88/100/100/100] | 4% [0/0/0/8/8/8] | — | 0% [0/0/0/0/0/0] | 67% [0/0/100/100/100/100] | 100% [100/100/100/100/100/100] | 50% [0/0/0/100/100/100] | 50% [0/0/0/100/100/100] | — | 100% [100/100/100/100/100/100] | 100% [100/100/100/100/100/100] | $0.49 |


Per-run differences against the gold are left out here: they quote the book exercise. `run.ts report` writes the full report to the gitignored `runs/`.

### Tool errors returned to the models (first line of each)

- claude-haiku-5-5 read-e-blues r4 import_tab: The tab did not validate: - "" is not a meter this app plays. Use 4/4, 3/4, 2/4, 6/8, 12/8.
- claude-haiku-5-5 read-e-blues r5 import_tab: The tab did not validate: - Bar 4 holds 4.25 quarter notes but 4/4 holds 4 quarter notes; a duration is misread.
- claude-sonnet-5-5 read-a-blues r2 import_tab: MCP error -32602: Input validation error: Invalid arguments for tool import_tab: Too big: expected string to have <=200 characters at uncertain[0]
- claude-opus-5-5 strum-68-unsupported r3 propose_tab: Bar 4 puts two notes on string 2 at slot 3. A string sounds one note at a time.