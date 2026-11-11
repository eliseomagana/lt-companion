# LT Companion — project context

Decisions here are load-bearing and easy to undo by accident. Each invariant
records *why* it is the way it is.

**What it is:** an audio-first web companion to Language Transfer's Thinking
Method for Spanish. Coursework for Georgia Tech CS 6460 (Educational
Technology). Vanilla HTML/CSS/JS, no build step, no framework. Deployed as a
static site (GitHub Pages) and installable as a PWA.

**Who it's for:** English speakers learning beginner Spanish, hands-free —
commuting, chores, exercise, screen off, headphones in. That constraint
drives nearly every design decision below.

---

## Running it

Serve over HTTP, don't open `index.html` as a file. Live Server, or:

```
npx serve .          # or: python -m http.server 5500
```

Add `?debug=1` to the URL for a live panel showing phase, queue, timers, and
every media/input event as it fires. The panel prints a `BUILD` string —
if it doesn't match what you expect, the browser served a cached `app.js`.
Hard-refresh with Ctrl+Shift+R.

**Media Session needs a secure context.** `localhost` counts; a LAN IP like
`192.168.1.x` does not, and hardware buttons will silently do nothing. To
test on a phone, use VS Code's Ports panel to forward the port publicly over
HTTPS, or deploy.

---

## Files

| File | Role |
|---|---|
| `index.html` | Five screens: start, lesson, answer, modules, summary. Plus the debug panel. |
| `app.js` | Everything — lesson data, SM-2, audio engine, Media Session, input. |
| `style.css` | Light/dark via CSS custom properties, auto-switching on `prefers-color-scheme`. |
| `audio/*.mp3` | One clip per lesson item, Azure TTS speech (~11.2 min total). |
| `audio/answers/*.mp3` | One clip per `prompt`: the Spanish answer, in `es-MX-JorgeNeural`. Filename is the item id. |
| `audio/ui/cue_*.mp3` | Spoken interface cues ("How'd you do?", "Got it.", "We'll come back to that."). |
| `audio/ui/wait_*.wav` | The soft wait sound for each response window. Its length *is* the timeout. |
| `generate-audio.mjs` | Generates the real audio from `LESSON_ITEMS` via Azure/OpenAI TTS, plus the cues. |
| `generate-sounds.mjs` | Synthesizes the wait sounds locally. No API. |
| `pronunciations.json` | Pronunciation dictionary: fixes a written fragment everywhere it's spoken. |
| `review.mjs` | Local review tool: listen, see the SSML, edit scripts, regenerate one clip. |
| `review-notes.json` | Per-item review status and notes, written by the review tool. |

---

## The data model

`LESSON_ITEMS` in `app.js` is an ordered array of 39 items across six
modules. Four types:

- **`concept`** — teaching audio. Has `caption`.
- **`vowel`** — like concept, plus `vowelLetter` shown large on screen.
- **`worked`** — a demonstrated example. Has `english`, `answer`, `caption`.
  Shows the answer; the learner is not tested.
- **`prompt`** — the learner produces the answer. Has `english`, `answer`,
  `hint`. This is the only type that is assessed.

Modules: 0 vowels · 1 `-tion→-ción` · 2 `-al` stress shift · 3 `-ic→-ico` ·
4 verb I-form · 5 chaining. Module membership is a hardcoded list in
`getModuleTag()` — **add an item and you must add its id there**, or it
falls through to "Module 5".

---

## Invariants

These are load-bearing. Each one was arrived at by hitting the problem.

### 1. Audio filenames must equal item ids

`playItem()` builds the path as `audio/{item.id}.mp3`. Rename an item and
you must rename its file. A missing file **falls back to TTS silently**, so
a broken path doesn't throw — it just quietly sounds wrong. After any id
change, cross-check:

```
node -e "const s=require('fs').readFileSync('app.js','utf8');const i=eval(s.match(/const LESSON_ITEMS = (\[[\s\S]*?\n\];)/)[1].slice(0,-1));const fs=require('fs');i.forEach(x=>{if(x.audioSrc&&!fs.existsSync(x.audioSrc))console.log('MISSING',x.audioSrc)});console.log('checked',i.length)"
```

### 2. Nothing may be asked that wasn't taught

Every element of a `prompt` answer must be derivable from an item that
appears **earlier in the array**. This is the Thinking Method's core premise
— nothing comes from nowhere — and it has already been violated and fixed
three times:

- `estación` was asked before the e-before-s rule existed (Spanish can't
  begin a word with S + consonant, so it prefixes an E).
- `typical → típico` sat in the `-ic` module, but *typical* ends in `-al`.
  A learner correctly applying Module 2 produces `ti-pi-KAL` and is marked
  wrong for using the rule they'd just been taught. Removed.
- `hablo` was asked when `hablar` had only been name-dropped in a list.

This isn't only a UX problem. A prompt requiring an untaught rule makes
"missed it" measure *sequencing* rather than recall, which corrupts the
self-report data the whole project rests on.

### 3. Timeouts are missing data, never a rating

If a learner doesn't respond, **do not call `sm2Update`** and **do not
record a latency**. The item keeps its existing interval and is requeued
(capped at one return per session, so a fully hands-free learner can't
loop). Results carry an `outcome` field: `rated`, `rated_no_attempt`,
`no_attempt`, `no_report`.

Silence is ambiguous — ran out of time, got distracted, drew a blank — and
all three look identical. Imputing a rating asserts something that wasn't
observed. It would also wreck the latency analysis, since every timeout
would contribute the same ceiling value. Latency stats include only entries
where `typeof latencyMs === "number"`.

### 4. Both `play` and `pause` route through `handleTap()`

A single headset press is **one** gesture, but the OS sends either `play` or
`pause` depending on what it believes the playback state is. After a clip
ends it believes playback stopped, so it sends `play` — which must mean
"continue", not "replay". Splitting these back into separate handlers
reintroduces the bug where pressing the button after a clip ended replayed
it instead of advancing.

`handleTap()` is state-aware: playing → pause, paused → resume, ended →
advance, answer screen → count presses.

### 5. Multi-press is counted in-app, not by the OS

Apple EarPods on Windows (confirmed) only ever emit `play`/`pause` — the OS
never synthesizes `nexttrack`/`previoustrack` from double or triple clicks.
`registerPress()` counts actions arriving within 450ms and resolves once
pressing stops: 1 = got it, 2 = missed it, 3+ = replay.

This only applies on the answer screen. Advancing through lesson audio fires
instantly, because a 450ms delay on the frequent action feels broken.
`nexttrack`/`previoustrack` handlers are still registered for hardware that
does send them, and bypass the timer.

### 6. Lesson audio is a real `<audio>` element, never `speechSynthesis`

`speechSynthesis` does not register with the Media Session API, so no lock
screen controls appear and playback is suspended on screen lock — fatal for
a hands-free app. One persistent `lessonAudio` element is reused for every
clip, because iOS unlocks that element on first user gesture and subsequent
`src` swaps then play without a new gesture.

This applies to **everything** the learner hears, not just lessons. The
Spanish answer (`audio/answers/`), the spoken cues (`audio/ui/cue_*`) and
the wait sound all play through `lessonAudio`. Device TTS went silent on a
locked phone and, worse, any gap in playback let the OS drop the media
controls, leaving a hands-free learner unable to self-report at all.

The wait sound is the other half of that: a quiet pad with a soft chime
three seconds before time is up. It keeps the media session alive while the
app waits, tells the learner time is running out without a ticking-clock
pressure, and **its `ended` event is the timeout** (a `setTimeout` backstop
fires 1.5s later only if the track can't play). Background timers on a
locked phone can be delayed; audio events can't. So: **change
`PROMPT_TIMEOUT` or `REPORT_TIMEOUT` → rerun `node generate-sounds.mjs`**, or
the track and the timeout disagree. While it plays, `state.waiting` is true
and `isAudioPlaying()` reports false, so a press answers instead of pausing.

TTS remains only as a fallback when a file fails to load.

### 7. Audio carries the lesson; text is secondary

Screen text is a caption, not the content. CC is **off by default** and
persists in `localStorage`. Don't move lesson content into the DOM where it
can only be read.

### 8. Captions carry language markers

`{{es:...}}` and `{{en:...}}` force pronunciation language in the audio
generator; `{{ipa:shown|ipa}}` gives an exact Spanish sound and
`{{say:shown|spoken}}` speaks a substitute, each showing only `shown`.
`{{pause}}` (1s) or `{{pause:2s}}` / `{{pause:500ms}}` (max 5s) inserts a
silence and shows nothing.
`stripLangMarkers()` **must** run before any caption reaches the screen,
and must accept every marker form the generator's `OVERRIDE_RE` does.

The English voice mangles bare fragments: `"-ción"` came out as "cyan".
`pronunciations.json` fixes a fragment everywhere it appears (whole
fragments only, never inside a word), so prefer an entry there over
marking up each caption. `→`, `=`, `+` are entries too ("becomes", "is",
"plus").

Auto-tagging uses a glossary plus a `NEVER_AUTO` stoplist for words that
are also English (`no`, `total`, `normal`, `animal`, `metal`,
`hospital`…) — without it, "**no** accent mark is needed" gets read in
Spanish.

**Write captions for a listener.** The learner never sees the text, so
don't refer to accent marks, spelling, letters, or "when you see". Nine
captions that did ("the accent mark on the ó", "spelled exactly the
same", "when you see an H") were rewritten; `review-notes.json` records
the originals.

Isolated vowel sounds (`ah`, `eh`, `ee`, `oh`, `oo`, and `{{es:A}}`-style
letters) become exact Spanish IPA with a pause after them, so captions keep
readable spellings while the voice gets the real sound. Write Spanish words
in captions rather than phonetic respellings (`kee-EH-roh`), which the
English voice misreads. Respellings of the *English* form (`NOR-mal`) stay,
because they demonstrate the contrast.

---

## Generating audio

```
export AZURE_SPEECH_KEY=...  AZURE_SPEECH_REGION=westus2
node generate-audio.mjs --dry      # inspect SSML, calls nothing
node generate-audio.mjs            # generate changed items only
node generate-audio.mjs --force    # regenerate everything
node generate-audio.mjs --only vowel_a
node generate-audio.mjs --answers  # answer clips only
node generate-sounds.mjs           # wait sounds; rerun after changing a timeout
node --env-file=.env review.mjs    # review tool at http://127.0.0.1:5500
```

The review tool edits `caption`/`english`/`answer`/`hint` in `app.js` by
replacing one field in one item, re-parsing, and restoring the file if the
value doesn't round-trip. Regeneration runs the real generator, so the
manifest stays authoritative.

The Azure resource is F0 tier in **westus2** — East US is blocked by the
Azure for Students region policy, so don't "fix" the region back. Keys can
also live in a gitignored `.env`, loaded with `node --env-file=.env …`
(Node 20.6+).

Reads `LESSON_ITEMS` directly, so filenames always match. Hashes each script
into `.audio-manifest.json` and skips unchanged items.

Azure is preferred over OpenAI TTS because 34 of 38 items embed Spanish
inside English sentences, and only SSML `<lang>` gives per-word phonetic
control. An English voice saying "hablar" with an aspirated H actively
teaches the opposite of Module 0.

**Do not change `TTS_EN_VOICE` / `TTS_ES_VOICE` once pilot data collection
begins.** A voice change mid-study is a confound, and the manifest hash
includes voice names, so changing one regenerates every clip. The same goes
for `TTS_RATE` (`-15%`, slowed because `-8%` was too fast for Andrew).

---

## Current state

Working: full lesson flow, SM-2 scheduling in `localStorage`, light/dark
theme, CC toggle, Media Session with hardware buttons, in-app multi-press,
auto-advance, timeout handling with requeue, debug panel. Modules screen
(collapsible modules and items; start from any module or item; the session
runs on from there). "Continue" resumes from `lt_position`, the furthest
new item reached, reset when a session finishes. Speed button steps lesson
clips through 0.8–1.25× (`lt_speed`); answers, cues and the wait sound
always play at 1×, and every result records `speed`.

Skipping ahead in the modules list can break invariant 2 for that learner:
a later prompt may need a rule they skipped. The screen says so. For pilot
data, `startLesson()` logs where a session began (debug panel only so far).

Audio: all 39 clips are Azure speech — `en-US-AndrewMultilingualNeural`
with `<lang xml:lang="es-MX">` spans (no nested `<voice>`; Azure rejects
it). Answers use `es-MX-JorgeNeural`.

Deployed: https://eliseomagana.github.io/lt-companion/ from `main` / root
(repo github.com/eliseomagana/lt-companion, public). Push to `main` redeploys.

Not done: no pre/post quiz, no PWA icons (manifest references
`icon-192.png` / `icon-512.png`, which don't exist), "Almost" rating is
unreachable by headphone (3 presses is taken by replay). Three orphan
sine-tone clips (`prompt_typical`, `prompt_communication`,
`prompt_need_to_communicate`) match no item.

---

## Open design question

Self-report is now effectively optional — a learner who never presses
anything completes the lesson producing only latency data and timeout
counts, no ratings. That's the honest consequence of treating silence as
missing data, and it makes the timeout rate a real measure of whether
hands-free use works rather than an assumption.

The unresolved part: with only three gestures available, "Almost" has no
home. The argument for dropping it to a binary scale is that "Almost" is
what a learner picks when they got it slowly — and response latency already
measures that, more objectively than self-report can.

---

## Course context

Deliverables: Milestone 1, 2, 3, then a final report and a recorded
walkthrough. Scope is the first ten exercises of LT Complete Spanish.
Evaluation is a small-N pilot (2–5 participants) with pre/post quizzes,
latency logs, and an exit survey.

Proposal feedback still to address in revisions:

1. **References** — the submitted draft cited one source, the product's own
   guide. Needs grounding in the literature. Claims already in the paper map
   onto: retrieval practice and desirable difficulties (Roediger & Karpicke
   2006; Bjork & Bjork 2011), judgments of learning and the illusion of
   competence (Koriat & Bjork 2005), spacing (Cepeda et al. 2006), cognitive
   load and the modality principle (Sweller 1988; Mayer & Moreno 2002), and
   construct validity / transfer-appropriate processing (Messick 1989;
   Morris, Bransford & Franks 1977).
2. **Learning experience lacks an "after"** — the section ends when the
   lesson does. The scheduler implies a return visit that's never described:
   review items surfacing before new material, the review/new ratio shifting
   across a week, what happens to a learner who returns after three weeks.
3. **Course vocabulary, not LT's** — the argument leans on Thinking Method
   terminology. Accessibility and ethics lenses are unused, and the CC
   toggle is an accessibility response that's never argued for.
4. **Name the concepts** — the overconfidence discussion is judgments of
   learning; the quiz worry ("accurately model the concepts thought
   processes") is construct validity.
5. **Timeline** — Milestones 1, 2, 3 are missing from the table.

Invariants 2 and 3 above are both construct validity arguments and are worth
writing into the revision directly.
