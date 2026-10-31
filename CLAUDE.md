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
| `index.html` | Four screens: start, lesson, answer, summary. Plus the debug panel. |
| `app.js` | Everything — lesson data, SM-2, audio engine, Media Session, input. |
| `style.css` | Light/dark via CSS custom properties, auto-switching on `prefers-color-scheme`. |
| `audio/*.mp3` | One clip per lesson item. **Currently placeholder tones, not speech.** |
| `generate-audio.mjs` | Generates the real audio from `LESSON_ITEMS` via Azure/OpenAI TTS. |

---

## The data model

`LESSON_ITEMS` in `app.js` is an ordered array of 38 items across six
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

TTS remains only as a fallback for a missing file, and for speaking the
Spanish answer and the English interface cues.

### 7. Audio carries the lesson; text is secondary

Screen text is a caption, not the content. CC is **off by default** and
persists in `localStorage`. Don't move lesson content into the DOM where it
can only be read.

### 8. Captions carry language markers

`{{es:...}}` and `{{en:...}}` force pronunciation language in the audio
generator. `stripLangMarkers()` **must** run before any caption reaches the
screen. Auto-tagging uses a glossary plus a `NEVER_AUTO` stoplist for words
that are also English (`no`, `total`, `normal`, `animal`, `metal`,
`hospital`…) — without it, "**no** accent mark is needed" gets read in
Spanish.

---

## Generating audio

```
export AZURE_SPEECH_KEY=...  AZURE_SPEECH_REGION=eastus
node generate-audio.mjs --dry      # inspect SSML, calls nothing
node generate-audio.mjs            # generate changed items only
node generate-audio.mjs --force    # regenerate everything
node generate-audio.mjs --only vowel_a
```

Reads `LESSON_ITEMS` directly, so filenames always match. Hashes each script
into `.audio-manifest.json` and skips unchanged items.

Azure is preferred over OpenAI TTS because 34 of 38 items embed Spanish
inside English sentences, and only SSML `<lang>` gives per-word phonetic
control. An English voice saying "hablar" with an aspirated H actively
teaches the opposite of Module 0.

**Do not change `TTS_EN_VOICE` / `TTS_ES_VOICE` once pilot data collection
begins.** A voice change mid-study is a confound, and the manifest hash
includes voice names, so changing one regenerates all 38 clips.

---

## Current state

Working: full lesson flow, SM-2 scheduling in `localStorage`, light/dark
theme, CC toggle, Media Session with hardware buttons, in-app multi-press,
auto-advance, timeout handling with requeue, debug panel.

Placeholder: **all 38 audio files are ffmpeg sine tones, not speech.** They
exist so Media Session has something real to attach to for button testing.
Replacing them via `generate-audio.mjs` is the next substantive step.

Not done: no git repo, not deployed to GitHub Pages, no pre/post quiz,
"Almost" rating is unreachable by headphone (3 presses is taken by replay).

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
