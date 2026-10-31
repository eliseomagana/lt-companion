// ============================================================
// LT Companion – app.js
// Audio-first architecture:
//   - Each lesson item has a real Audio() element (WAV placeholder,
//     swap for MP3 recordings later)
//   - Media Session API attaches to that element → hardware buttons work
//   - CC toggle shows/hides the lesson text overlay
//   - TTS is OFF by default — audio files carry the content
// ============================================================

// ── LESSON DATA ──────────────────────────────────────────────
const LESSON_ITEMS = [

  // ── MODULE 0: Vowels ──────────────────────────────────────
  {
    id: "vowel_intro",
    type: "concept",
    audioSrc: "audio/vowel_intro.mp3",
    caption: `Here's the most important thing in Spanish pronunciation — and it's simpler than English, not harder.

Spanish has exactly five vowel sounds. Just five. They never change.

English has somewhere around fifteen vowel sounds, and they shift depending on the word, the accent, even the speed you're speaking. Your ear has spent years learning to ignore that chaos.

For Spanish, you're going to unlearn it. Five sounds. Always the same.`,
  },
  {
    id: "vowel_a",
    type: "vowel",
    vowelLetter: "A",
    audioSrc: "audio/vowel_a.mp3",
    caption: `The Spanish A. Always "ah" — like the sound a doctor asks you to make. Open, from the back of the throat. Not "ay" like "face." Not "uh" like "about." Just: ah. Examples: "casa" — ah. "gracias" — ah. Every single time.`,
  },
  {
    id: "vowel_e",
    type: "vowel",
    vowelLetter: "E",
    audioSrc: "audio/vowel_e.mp3",
    caption: `The Spanish E. Always "eh" — like the "e" in "bed." Short and clean. Not "ee" like "he." Not "ay" like "they." Just: eh. Examples: "leche" — eh. "nombre" — eh. Consistent every time.`,
  },
  {
    id: "vowel_i",
    type: "vowel",
    vowelLetter: "I",
    audioSrc: "audio/vowel_i.mp3",
    caption: `The Spanish I. Always "ee" — like the "ee" in "feet." Pure, held. Not "ih" like "bit." Not "eye" like "mine." Just: ee. Examples: "sí" — ee. "libro" — ee. Never wavers.`,
  },
  {
    id: "vowel_o",
    type: "vowel",
    vowelLetter: "O",
    audioSrc: "audio/vowel_o.mp3",
    caption: `The Spanish O. Always "oh" — like "go," but shorter, without the "w" glide at the end that English speakers add. Not "aw" like "more." Not "uh" like "come." Just: oh. Examples: "hola" — oh. "poco" — oh. Pure and round.`,
  },
  {
    id: "vowel_u",
    type: "vowel",
    vowelLetter: "U",
    audioSrc: "audio/vowel_u.mp3",
    caption: `The Spanish U. Always "oo" — like "food." Lips forward, consistent. Not "yoo" like "use." Not "uh" like "cup." Just: oo. Examples: "tú" — oo. "mucho" — oo. Every time.`,
  },
  {
    id: "vowel_sequence",
    type: "concept",
    audioSrc: "audio/vowel_sequence.mp3",
    caption: `Say the five vowels out loud, in order: A — ah. E — eh. I — ee. O — oh. U — oo. These five sounds are your foundation. Every Spanish word you'll ever say is built from them. From now on, when you see a vowel in a Spanish word, you already know exactly how to say it.`,
  },

  // ── MODULE 1: -tion → -ción ───────────────────────────────
  {
    id: "concept_tion_intro",
    type: "concept",
    audioSrc: "audio/concept_tion_intro.mp3",
    caption: `Here's your first pattern — and it's going to give you hundreds of words instantly. Any English word ending in "-tion" almost certainly exists in Spanish too. You just change the ending to "-ción." The accent mark on the ó tells you where to stress the word. That's all it does. Let's see it work.`,
  },
  {
    id: "worked_nation",
    type: "worked",
    english: "nation",
    answer: "nación",
    audioSrc: "audio/worked_nation.mp3",
    caption: `"nation" ends in "-tion," so change it to "-ción": nación. Notice the vowels: A is "ah," O is "oh." Say it: nah-SYON. The stress falls on the ó — that's what the accent mark is telling you.`,
  },
  {
    id: "prompt_information",
    type: "prompt",
    english: "information",
    answer: "información",
    hint: `in-for-ma-SYON`,
    audioSrc: "audio/prompt_information.mp3",
  },
  {
    id: "prompt_conversation",
    type: "prompt",
    english: "conversation",
    answer: "conversación",
    hint: `con-ver-sa-SYON`,
    audioSrc: "audio/prompt_conversation.mp3",
  },
  {
    id: "concept_e_before_s",
    type: "concept",
    audioSrc: "audio/concept_e_before_s.mp3",
    caption: `Before the next one, you need one more piece — and it explains something you've probably already noticed about Spanish.

Spanish words can't begin with an S followed by another consonant. The mouth doesn't do it. So whenever a word would start that way, Spanish puts an E in front of it to give the S something to lean on.

That's where "España" comes from — compare English "Spain." And "español," "escuela" for school, "estudiante" for student, "especial" for special.

So if you're converting an English word that starts with S plus a consonant, you add an E before you do anything else. "Spanish" doesn't become "spañol." It becomes "español."`,
  },
  {
    id: "prompt_station",
    type: "prompt",
    english: "station",
    answer: "estación",
    hint: `Starts with S + T, so it needs the E — then -tion becomes -ción`,
    audioSrc: "audio/prompt_station.mp3",
  },

  // ── MODULE 2: -al → -al (stress shift) ───────────────────
  {
    id: "concept_al_intro",
    type: "concept",
    audioSrc: "audio/concept_al_intro.mp3",
    caption: `Here's a pattern that's almost free — you don't change a single letter.

A whole family of English words ending in "-al" are spelled exactly the same in Spanish. Normal. Natural. Total. Metal. Animal. Hospital. Identical spelling.

What changes is where you put the weight. In English we front-load these words: NOR-mal. TO-tal. AN-i-mal. In Spanish the stress moves to the end: nor-MAL. to-TAL. a-ni-MAL.

And this isn't arbitrary. Spanish has a rule: when a word ends in a consonant other than N or S, the stress falls on the last syllable. "-al" ends in L. So the stress always pulls to that final AL — and because the rule already predicts it, no accent mark is needed.`,
  },
  {
    id: "worked_normal",
    type: "worked",
    english: "normal",
    answer: "normal",
    audioSrc: "audio/worked_normal.mp3",
    caption: `"normal" is n-o-r-m-a-l in both languages. Not one letter changes. But listen to the difference: English says NOR-mal, weight at the front. Spanish says {{es:normal}}, weight at the end. And your vowels snap into place — O is "oh," A is "ah." {{es:normal}}.`,
  },
  {
    id: "worked_natural",
    type: "worked",
    english: "natural",
    answer: "natural",
    audioSrc: "audio/worked_natural.mp3",
    caption: `"natural" — same spelling again. English flattens it: NATCH-rul. Spanish gives every vowel its full value and stresses the end: {{es:natural}}. Three clean vowels — ah, oo, ah. {{es:natural}}.`,
  },
  {
    id: "prompt_metal",
    type: "prompt",
    english: "metal",
    answer: "metal",
    hint: `Same spelling — me-TAL, stress on the end`,
    audioSrc: "audio/prompt_metal.mp3",
  },
  {
    id: "prompt_animal",
    type: "prompt",
    english: "animal",
    answer: "animal",
    hint: `a-ni-MAL — three "ah"/"ee" vowels, stress on the end`,
    audioSrc: "audio/prompt_animal.mp3",
  },
  {
    id: "prompt_total",
    type: "prompt",
    english: "total",
    answer: "total",
    hint: `to-TAL — same spelling, stress on the end`,
    audioSrc: "audio/prompt_total.mp3",
  },
  {
    id: "concept_silent_h",
    type: "concept",
    audioSrc: "audio/concept_silent_h.mp3",
    caption: `One more thing before the next word, and it's a rule with no exceptions.

The letter H is completely silent in Spanish. Always. It gets written, but it is never pronounced.

"hola" is "OH-la," not "HO-la." "hora," meaning hour, is "OH-ra." "hombre," meaning man, is "OM-bre."

This is easier than it sounds, because English does the same thing in a handful of words you already say — "hour," "honest," "honor." Spanish just applies it to every single H.

So when you see an H at the start of a Spanish word, your mouth skips straight to the vowel.`,
  },
  {
    id: "prompt_hospital",
    type: "prompt",
    english: "hospital",
    answer: "hospital",
    hint: `Same spelling — but the H is silent: os-pi-TAL`,
    audioSrc: "audio/prompt_hospital.mp3",
  },

  // ── MODULE 3: -ic → -ico ─────────────────────────────────
  {
    id: "concept_ic_intro",
    type: "concept",
    audioSrc: "audio/concept_ic_intro.mp3",
    caption: `Another pattern. English words ending in "-ic" become "-ico" in Spanish. This one is almost mechanical — the word usually stays the same, you just add an "o" and shift the stress. Watch.`,
  },
  {
    id: "worked_electric",
    type: "worked",
    english: "electric",
    answer: "eléctrico",
    audioSrc: "audio/worked_electric.mp3",
    caption: `"electric" → add "-o" to get "eléctrico." The accent on the é tells you: stress falls on the second syllable — eh-LEK-tree-koh. Vowels: E is "eh," I is "ee," O is "oh." You already know them all.`,
  },
  {
    id: "prompt_public",
    type: "prompt",
    english: "public",
    answer: "público",
    hint: `POO-blee-koh — add the -o`,
    audioSrc: "audio/prompt_public.mp3",
  },
  {
    id: "prompt_historic",
    type: "prompt",
    english: "historic",
    answer: "histórico",
    hint: `ees-TOR-ee-koh`,
    audioSrc: "audio/prompt_historic.mp3",
  },

  // ── MODULE 3: Verb I-form ─────────────────────────────────
  {
    id: "concept_verbs_intro",
    type: "concept",
    audioSrc: "audio/concept_verbs_intro.mp3",
    caption: `Now let's look at verbs — how to say "I do something." Spanish verbs in their base form (the infinitive) end in -ar, -er, or -ir. For example: "hablar" means "to speak." "comer" means "to eat." To say "I" do something, you drop that infinitive ending and replace it with -o. hablar → hablo. comer → como. The -o ending always means "I."`,
  },
  {
    id: "worked_querer",
    type: "worked",
    english: "I want",
    answer: "quiero",
    audioSrc: "audio/worked_querer.mp3",
    caption: `The verb "to want" is querer. Drop the infinitive ending -er, add -o… but this verb has a small spelling change in the middle: querer → quiero. "I want" = quiero. kee-EH-roh — hear those pure vowels: ee, eh, oh.`,
  },
  {
    id: "concept_necesitar",
    type: "concept",
    audioSrc: "audio/concept_necesitar.mp3",
    caption: `The verb "to need" is necesitar. ne-se-si-TAR — four syllables. Say it a few times. Now apply the rule: drop -ar, add -o. necesitar → necesito. ne-se-SEE-toh. "I need."`,
  },
  {
    id: "prompt_necesito",
    type: "prompt",
    english: "I need",
    answer: "necesito",
    hint: `necesitar → drop -ar, add -o`,
    audioSrc: "audio/prompt_necesito.mp3",
  },
  {
    id: "worked_usar",
    type: "worked",
    english: "I use",
    answer: "uso",
    audioSrc: "audio/worked_usar.mp3",
    caption: `"to use" is usar. Drop -ar, add -o: uso. OO-soh. Two syllables. Clean. This is a regular -ar verb — no surprises.`,
  },
  {
    id: "concept_hablar",
    type: "concept",
    audioSrc: "audio/concept_hablar.mp3",
    caption: `Here's the verb you'll use more than almost any other. "To speak" is hablar. a-BLAR — and remember, that H is silent, so it opens on the A.

Two syllables, stress on the end, because it ends in R — a consonant that isn't N or S. Same stress rule you learned with the -al words.

Say it a few times: hablar. hablar.

Now you know what it means and how it sounds. Next you'll put the -o ending on it yourself.`,
  },
  {
    id: "prompt_hablo",
    type: "prompt",
    english: "I speak",
    answer: "hablo",
    hint: `hablar → drop -ar, add -o → AH-blo`,
    audioSrc: "audio/prompt_hablo.mp3",
  },

  // ── MODULE 4: Chaining verbs ──────────────────────────────
  {
    id: "concept_chaining",
    type: "concept",
    audioSrc: "audio/concept_chaining.mp3",
    caption: `Here's where things get powerful. In English you can chain verbs: "I want to use." "I need to speak." Spanish works the same way — conjugate the first verb (add the -o ending), then leave the second verb in its infinitive form. "I want to use" → quiero usar. You only ever conjugate one verb in a chain. The rest stay as infinitives.`,
  },
  {
    id: "worked_quiero_usar",
    type: "worked",
    english: "I want to use it",
    answer: "quiero usarlo",
    audioSrc: "audio/worked_quiero_usar.mp3",
    caption: `"I want" = quiero. "to use" = usar. To attach "it" — "lo" in Spanish — you glue it to the end of the infinitive: usar + lo = usarlo. quiero usarlo. The chain: conjugated verb + infinitive-with-pronoun.`,
  },
  {
    id: "prompt_need_to_use",
    type: "prompt",
    english: "I need to use it",
    answer: "necesito usarlo",
    hint: `necesito + usar + lo`,
    audioSrc: "audio/prompt_need_to_use.mp3",
  },
  {
    id: "prompt_want_to_speak",
    type: "prompt",
    english: "I want to speak",
    answer: "quiero hablar",
    hint: `quiero + hablar`,
    audioSrc: "audio/prompt_want_to_speak.mp3",
  },
  {
    id: "concept_negation",
    type: "concept",
    audioSrc: "audio/concept_negation.mp3",
    caption: `Making something negative in Spanish is easier than in English.

In English we have to bring in a helper verb: "I use it" becomes "I DON'T use it." That word "don't" appears out of nowhere.

Spanish does none of that. You put "{{es:no}}" in front of the verb and you're finished.

"quiero" means I want. "{{es:no quiero}}" means I don't want. "hablo" means I speak. "{{es:no hablo}}" means I don't speak.

One word, in front, no rearranging. When you hear "don't" in English, just reach for "{{es:no}}" and keep everything else exactly where it was.`,
  },
  {
    id: "prompt_dont_want_to_use",
    type: "prompt",
    english: "I don't want to use it",
    answer: "no quiero usarlo",
    hint: `"no" in front, everything else unchanged`,
    audioSrc: "audio/prompt_dont_want_to_use.mp3",
  },
];

const PROMPT_ITEMS = LESSON_ITEMS.filter((i) => i.type === "prompt");

// Captions embed {{es:…}} / {{en:…}} markers that tell the audio generator
// which language to pronounce a span in. They must never reach the screen.
function stripLangMarkers(text) {
  return String(text).replace(/\{\{(?:es|en):([^}]*)\}\}/gi, "$1");
}

// ── SM-2 SPACED REPETITION ────────────────────────────────
function sm2Update(card, quality) {
  const q = [0, 3, 5][quality];
  let { ef = 2.5, interval = 1, repetitions = 0 } = card;
  if (q < 3) { repetitions = 0; interval = 1; }
  else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * ef);
    repetitions += 1;
  }
  ef = Math.max(1.3, ef + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return { ef, interval, repetitions, nextReview: Date.now() + interval * 86400000 };
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem("lt_progress") || "{}"); }
  catch { return {}; }
}
function saveProgress(d) {
  try { localStorage.setItem("lt_progress", JSON.stringify(d)); } catch {}
}

// ── CC PREFERENCE ─────────────────────────────────────────
function loadCC() {
  try { return localStorage.getItem("lt_cc") === "on"; } catch { return false; }
}
function saveCC(val) {
  try { localStorage.setItem("lt_cc", val ? "on" : "off"); } catch {}
}

// ── BUILD STAMP ───────────────────────────────────────────
// Bump this whenever behavior changes. The debug panel prints it so
// you can tell instantly whether the browser served a cached file.
const BUILD = "2026-10-30 · auto-advance + timeout";

// ── TIMING ────────────────────────────────────────────────
// Language Transfer's own recordings leave roughly 3–5s of silence
// before the student answers; these windows are anchored to that,
// with margin so a real attempt is never cut off.
const TEACHING_GAP    = 1800;  // beat after a teaching clip before auto-advancing
const PROMPT_TIMEOUT  = 9000;  // thinking time before the answer is revealed
const REPORT_TIMEOUT  = 7000;  // time to self-report before we move on

let phaseTimer = null;
function clearPhaseTimer() { clearTimeout(phaseTimer); phaseTimer = null; }

// ── DEBUG PANEL ───────────────────────────────────────────
// Enable with ?debug=1 in the URL. Logs every media/input event
// so you can see exactly which handler a hardware button triggers.
const DEBUG = new URLSearchParams(location.search).has("debug");
let debugLines = [];

function dbg(event, detail) {
  if (!DEBUG) return;
  const t = new Date().toLocaleTimeString("en-US", { hour12: false });
  debugLines.unshift(`[${t}] ${event}${detail ? " · " + detail : ""}`);
  debugLines = debugLines.slice(0, 14);
  const panel = document.getElementById("debug-log");
  if (panel) panel.textContent = debugLines.join("\n");
}

function dbgState() {
  if (!DEBUG) return;
  const el = document.getElementById("debug-state");
  if (!el) return;
  const a = lessonAudio;
  el.textContent =
    `build: ${BUILD}\n` +
    `phase: ${state.phase}\n` +
    `item: ${state.currentItem ? state.currentItem.id : "—"}\n` +
    `queue: ${state.queue.length} left · ${state.presented} shown\n` +
    `timer: ${phaseTimer ? "armed" : "—"}\n` +
    `audioPaused flag: ${state.audioPaused}\n` +
    `el.paused: ${a.paused}  el.ended: ${a.ended}\n` +
    `time: ${a.currentTime.toFixed(1)}s / ${isNaN(a.duration) ? "?" : a.duration.toFixed(1)}s\n` +
    `mediaSession: ${("mediaSession" in navigator) ? navigator.mediaSession.playbackState : "unsupported"}\n` +
    `secure context: ${window.isSecureContext}`;
}

if (DEBUG) setInterval(dbgState, 250);

// ── AUDIO ENGINE ──────────────────────────────────────────
// Primary audio element — Media Session attaches here.
// All lesson audio plays through this one element.
const lessonAudio = new Audio();
lessonAudio.preload = "none";

// Fallback TTS (only used if audio file fails to load)
function ttsFallback(text, lang = "en-US", onEnd) {
  if (!("speechSynthesis" in window)) { onEnd && onEnd(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang; u.rate = 0.92;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

function playItem(item, onEnd) {
  window.speechSynthesis && window.speechSynthesis.cancel();
  lessonAudio.pause();
  lessonAudio.currentTime = 0;

  lessonAudio.src = item.audioSrc;

  lessonAudio.onended = () => {
    state.audioPaused = false;
    updateWaveform(false);
    onEnd && onEnd();
  };

  lessonAudio.onerror = () => {
    state.audioPaused = false;
    // Audio file missing — fall back to TTS
    const text = item.caption || item.hint || item.english || "";
    ttsFallback(text, "en-US", onEnd);
  };

  lessonAudio.play()
    .then(() => {
      updateWaveform(true);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
    })
    .catch(() => {
      const text = item.caption || item.hint || item.english || "";
      ttsFallback(text, "en-US", onEnd);
    });
}

function stopAudio() {
  state.audioPaused = false;
  lessonAudio.pause();
  lessonAudio.currentTime = 0;
  window.speechSynthesis && window.speechSynthesis.cancel();
  updateWaveform(false);
}

// ── WAVEFORM ANIMATION ────────────────────────────────────
function updateWaveform(playing) {
  const bars = document.querySelectorAll(".wave-bar");
  bars.forEach((b) => b.classList.toggle("playing", playing));
}

// ── APP STATE ─────────────────────────────────────────────
const state = {
  phase: "idle",      // idle | listening | wait_response | show_answer | done
  queue: [],          // items still to present this session
  presented: 0,       // how many have been shown (incl. requeues)
  requeued: {},       // id -> times returned to the queue this session
  currentItem: null,
  promptStartTime: null,
  sessionResults: [],
  progress: loadProgress(),
  _pendingLatency: null,
  _pendingTimedOut: false,
  ccOn: loadCC(),
  audioPaused: false,   // true while user has manually paused mid-item
};

// ── DOM REFS ─────────────────────────────────────────────
const screen = {
  start:   document.getElementById("screen-start"),
  lesson:  document.getElementById("screen-lesson"),
  answer:  document.getElementById("screen-answer"),
  summary: document.getElementById("screen-summary"),
};

const els = {
  startBtn:        document.getElementById("btn-start"),
  continueBtn:     document.getElementById("btn-continue"),
  // lesson
  moduleTag:       document.getElementById("module-tag"),
  itemTypeLabel:   document.getElementById("item-label"),
  vowelDisplay:    document.getElementById("vowel-display"),
  promptDisplay:   document.getElementById("prompt-display"),
  ccPanel:         document.getElementById("cc-panel"),
  ccText:          document.getElementById("cc-text"),
  ccToggle:        document.getElementById("btn-cc"),
  tapZone:         document.getElementById("tap-zone"),
  tapInstruction:  document.getElementById("tap-instruction"),
  progressBar:     document.getElementById("progress-bar"),
  progressText:    document.getElementById("progress-text"),
  // answer
  answerEnglish:   document.getElementById("answer-english"),
  answerText:      document.getElementById("answer-text"),
  answerHint:      document.getElementById("answer-hint"),
  latencyBadge:    document.getElementById("latency-badge"),
  btnNo:           document.getElementById("btn-no"),
  btnMaybe:        document.getElementById("btn-maybe"),
  btnYes:          document.getElementById("btn-yes"),
  // summary
  summaryBody:     document.getElementById("summary-body"),
  btnRestart:      document.getElementById("btn-restart"),
};

// ── SCREEN SWITCHING ─────────────────────────────────────
function showScreen(name) {
  Object.values(screen).forEach((s) => s.classList.remove("active"));
  screen[name].classList.add("active");
}

// ── CC TOGGLE ────────────────────────────────────────────
function applyCC() {
  els.ccPanel.classList.toggle("cc-visible", state.ccOn);
  els.ccToggle.classList.toggle("cc-active", state.ccOn);
  els.ccToggle.setAttribute("aria-pressed", state.ccOn);
}

els.ccToggle.addEventListener("click", () => {
  state.ccOn = !state.ccOn;
  saveCC(state.ccOn);
  applyCC();
});

// ── PROGRESS BAR ─────────────────────────────────────────
function updateProgress() {
  const total = state.presented + state.queue.length;
  const pct = total ? Math.round((state.presented / total) * 100) : 0;
  els.progressBar.style.width = pct + "%";
  els.progressText.textContent = `${state.presented} / ${total}`;
}

// ── MODULE LABEL ─────────────────────────────────────────
function getModuleTag(item) {
  if (item.id.startsWith("vowel")) return "Module 0 · Vowels";
  if (["concept_tion_intro","worked_nation","prompt_information",
       "prompt_conversation","concept_e_before_s","prompt_station"].includes(item.id))
    return "Module 1 · -tion → -ción";
  if (["concept_al_intro","worked_normal","worked_natural","prompt_metal",
       "prompt_animal","prompt_total","concept_silent_h","prompt_hospital"].includes(item.id))
    return "Module 2 · -al (stress shift)";
  if (["concept_ic_intro","worked_electric","prompt_public",
       "prompt_historic"].includes(item.id))
    return "Module 3 · -ic → -ico";
  if (["concept_verbs_intro","worked_querer","concept_necesitar","prompt_necesito",
       "worked_usar","concept_hablar","prompt_hablo"].includes(item.id))
    return "Module 4 · Verb I-form";
  return "Module 5 · Chaining";
}

// ── LESSON FLOW ──────────────────────────────────────────
function startLesson() {
  state.queue = LESSON_ITEMS.slice();
  state.presented = 0;
  state.requeued = {};
  state.sessionResults = [];
  showScreen("lesson");
  applyCC();
  nextItem();
}

// An item that got no response was never assessed, so its SM-2 state
// is left untouched and it simply comes back — same as a card you
// never answered in Anki. Capped at one requeue per session so a
// fully hands-free learner can't loop forever.
function requeueItem(item) {
  const n = state.requeued[item.id] || 0;
  if (n >= 1) {
    dbg("↷ not requeued", item.id + " (already returned once)");
    return false;
  }
  state.requeued[item.id] = n + 1;
  state.queue.push(item);
  dbg("↷ requeued", item.id);
  return true;
}

function nextItem() {
  clearPhaseTimer();
  if (state.queue.length === 0) { showSummary(); return; }

  const item = state.queue.shift();
  state.currentItem = item;
  state.presented++;
  updateProgress();

  els.moduleTag.textContent = getModuleTag(item);
  updateMediaMetadata(item);

  if (item.type === "prompt") showPrompt(item);
  else showListenItem(item);
}

// Concept, vowel, worked — all share the listening screen layout
function showListenItem(item) {
  state.phase = "listening";

  // Type badge
  const labels = { concept: "Listen", vowel: "Vowel", worked: "Worked Example" };
  els.itemTypeLabel.textContent = labels[item.type] || "Listen";
  els.itemTypeLabel.dataset.type = item.type;

  // Vowel letter or hide it
  if (item.type === "vowel") {
    els.vowelDisplay.textContent = item.vowelLetter;
    els.vowelDisplay.classList.remove("hidden");
  } else {
    els.vowelDisplay.classList.add("hidden");
  }

  // Worked example: show English → answer above waveform
  if (item.type === "worked") {
    els.promptDisplay.textContent = `"${item.english}" → ${item.answer}`;
    els.promptDisplay.classList.remove("hidden");
  } else {
    els.promptDisplay.classList.add("hidden");
  }

  // CC text. Captions carry {{es:…}} / {{en:…}} pronunciation markers for
  // the audio generator; strip them for display.
  els.ccText.textContent = stripLangMarkers(item.caption || "");

  els.tapInstruction.textContent = "Tap or press Space to continue";
  els.tapZone.classList.remove("pulsing");

  playItem(item, () => {
    els.tapZone.classList.add("pulsing");
    // Teaching items carry no measurement, so flowing on automatically
    // costs nothing. A press during the gap just advances sooner.
    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      dbg("⏩ auto-advance", item.id);
      handleAdvance();
    }, TEACHING_GAP);
  });
}

function showPrompt(item) {
  state.phase = "wait_response";
  state.promptStartTime = null;

  els.itemTypeLabel.textContent = "Your turn";
  els.itemTypeLabel.dataset.type = "prompt";
  els.vowelDisplay.classList.add("hidden");

  // Big English word — the only thing on screen
  els.promptDisplay.textContent = `"${item.english}"`;
  els.promptDisplay.classList.remove("hidden");

  els.ccText.textContent = "";  // No CC spoiler on prompt
  els.tapInstruction.textContent = "Think of the answer, then tap or press Space";
  els.tapZone.classList.remove("pulsing");

  playItem(item, () => {
    state.promptStartTime = Date.now();
    els.tapZone.classList.add("pulsing");
    // No response within the window is MISSING DATA, not a wrong answer.
    // We reveal the answer but record no latency and no rating.
    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      dbg("⏰ prompt timeout", item.id + " — no attempt recorded");
      revealAnswer({ timedOut: true });
    }, PROMPT_TIMEOUT);
  });
}

function revealAnswer(opts) {
  clearPhaseTimer();
  const timedOut = !!(opts && opts.timedOut);
  const item = state.currentItem;
  // A timed-out prompt yields no latency — imputing one would put a pile
  // of identical ceiling values into the analysis and flatten any real signal.
  const latencyMs = (!timedOut && state.promptStartTime)
    ? Date.now() - state.promptStartTime
    : null;
  state.phase = "show_answer";
  stopAudio();
  showScreen("answer");

  els.answerEnglish.textContent = `"${item.english}"`;
  els.answerText.textContent = item.answer;
  els.answerHint.textContent = item.hint || "";

  if (latencyMs !== null) {
    els.latencyBadge.textContent = `${(latencyMs / 1000).toFixed(1)}s`;
    els.latencyBadge.classList.remove("hidden");
  } else {
    els.latencyBadge.classList.add("hidden");
  }

  state._pendingLatency = latencyMs;
  state._pendingTimedOut = timedOut;

  // Say the answer, then cue that a self-report is expected. With the
  // screen off this spoken cue is the only affordance the learner has.
  speakAnswer(item, () => {
    speakCue("Got it?");
    // Self-report is optional. Staying silent is not a rating — the item
    // is left unassessed and simply returns.
    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      dbg("⏰ report timeout", item.id + " — no rating recorded");
      skipReport();
    }, REPORT_TIMEOUT);
  });
}

// No self-report given. SM-2 is deliberately NOT updated: the item was
// never assessed, so its interval stays exactly where it was and the
// item comes back rather than being scored on silence.
function skipReport() {
  clearPhaseTimer();
  const item = state.currentItem;
  state.sessionResults.push({
    id: item.id,
    quality: null,
    latencyMs: null,
    outcome: state._pendingTimedOut ? "no_attempt" : "no_report",
  });
  dbg("○ no response", `${item.id} — SM-2 untouched`);
  requeueItem(item);
  showScreen("lesson");
  nextItem();
}

// Speak the Spanish answer. Replayable from the answer screen.
function speakAnswer(item, onEnd) {
  if (!item || !("speechSynthesis" in window)) { onEnd && onEnd(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(item.answer);
  u.lang = "es-ES"; u.rate = 0.85;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

// Short spoken interface cue in English (not lesson content).
function speakCue(text, onEnd) {
  if (!("speechSynthesis" in window)) { onEnd && onEnd(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = 1.05;
  if (onEnd) u.onend = onEnd;
  // Don't let a missing voice strand the flow
  setTimeout(() => { if (onEnd && !u.__done) { u.__done = true; onEnd(); } }, 2500);
  u.onend = () => { if (onEnd && !u.__done) { u.__done = true; onEnd(); } };
  window.speechSynthesis.speak(u);
}

function rateAnswer(quality) {
  const item = state.currentItem;
  clearPhaseTimer();
  clearTimeout(pressTimer);
  pressCount = 0;
  dbg("★ rated", `${item.id} = ${["missed","almost","got it"][quality]}`);
  state.progress[item.id] = sm2Update(state.progress[item.id] || {}, quality);
  saveProgress(state.progress);
  state.sessionResults.push({
    id: item.id,
    quality,
    latencyMs: state._pendingLatency,
    // Rated after a timed-out prompt: the rating stands, but there is no
    // usable latency, so it must stay out of the timing analysis.
    outcome: state._pendingTimedOut ? "rated_no_attempt" : "rated",
  });
  showScreen("lesson");
  nextItem();
}

function showSummary() {
  state.phase = "done";
  stopAudio();
  showScreen("summary");
  const r = state.sessionResults;
  const got = r.filter((x) => x.quality === 2).length;
  const maybe = r.filter((x) => x.quality === 1).length;
  const missed = r.filter((x) => x.quality === 0).length;
  const noResp = r.filter((x) => x.quality === null).length;
  // Latency stats exclude every unanswered prompt — a timeout has no
  // measured response time and averaging one in would be fiction.
  const lats = r.filter((x) => typeof x.latencyMs === "number");
  const avg = lats.length
    ? (lats.reduce((s, x) => s + x.latencyMs, 0) / lats.length / 1000).toFixed(1) : "—";
  const concepts = LESSON_ITEMS.filter((i) => i.type !== "prompt").length;

  els.summaryBody.innerHTML = `
    <div class="stat-row"><span>Items presented</span><strong>${r.length}</strong></div>
    <div class="stat-row"><span>Concepts covered</span><strong>${concepts}</strong></div>
    <div class="stat-row got"><span>✓ Got it</span><strong>${got}</strong></div>
    <div class="stat-row maybe"><span>~ Almost</span><strong>${maybe}</strong></div>
    <div class="stat-row missed"><span>✗ Missed</span><strong>${missed}</strong></div>
    <div class="stat-row"><span>○ No response</span><strong>${noResp}</strong></div>
    <div class="stat-row"><span>Avg response time</span><strong>${avg}s</strong>
      </div>
    <p class="summary-note">
      Missed items reappear sooner next session. Unanswered items keep their
      existing schedule — they were never assessed, so nothing was inferred
      from the silence.${lats.length < r.length
        ? ` Response time averages ${lats.length} timed ${lats.length === 1 ? "answer" : "answers"}.`
        : ""}
    </p>
  `;
}

// ── MULTI-PRESS DETECTION ─────────────────────────────────
// Many headsets (Apple EarPods on Windows among them) only ever report
// a single play/pause action — the OS never synthesizes nexttrack or
// previoustrack from a double or triple click. So we count the presses
// ourselves: collect actions arriving in quick succession and resolve
// once the user stops pressing. One physical button, three commands.
const MULTI_PRESS_WINDOW = 450;  // ms of quiet before we decide
let pressCount = 0;
let pressTimer = null;

function registerPress(onResolve) {
  pressCount++;
  dbg("· press " + pressCount, "waiting…");
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    const n = pressCount;
    pressCount = 0;
    dbg("⇢ resolved", n + (n === 1 ? " press" : " presses"));
    onResolve(n);
  }, MULTI_PRESS_WINDOW);
}

// Answer screen: 1 = got it, 2 = missed it, 3+ = replay the answer.
function handleAnswerPress() {
  // The learner is responding, so cancel the no-response timeout before
  // it can fire while we're still counting presses.
  clearPhaseTimer();
  registerPress((n) => {
    if (n === 1) {
      speakCue("Got it.", () => rateAnswer(2));
    } else if (n === 2) {
      speakCue("We'll come back to that.", () => rateAnswer(0));
    } else {
      // Replay, then restart the window so they still get a chance to rate.
      speakAnswer(state.currentItem, () => {
        speakCue("Got it?");
        clearPhaseTimer();
        phaseTimer = setTimeout(skipReport, REPORT_TIMEOUT);
      });
    }
  });
}

// ── INPUT HANDLING ────────────────────────────────────────
function isAudioPlaying() {
  if (!lessonAudio.paused && !lessonAudio.ended) return true;
  if ("speechSynthesis" in window && window.speechSynthesis.speaking) return true;
  return false;
}

// Space / tap / single headset press.
// Priority: replay-answer → pause → resume → advance.
function handleTap() {
  // On the answer screen every press feeds the multi-press counter,
  // which resolves to a rating once you stop pressing.
  if (state.phase === "show_answer") {
    handleAnswerPress();
    return;
  }

  if (isAudioPlaying()) {
    // Pause mid-item
    state.audioPaused = true;
    lessonAudio.pause();
    window.speechSynthesis && window.speechSynthesis.pause();
    updateWaveform(false);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    els.tapZone.classList.remove("pulsing");
    els.tapInstruction.textContent = "Tap or Space to resume";
  } else if (state.audioPaused) {
    // Resume from where it left off
    state.audioPaused = false;
    lessonAudio.play().then(() => {
      updateWaveform(true);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    });
    window.speechSynthesis && window.speechSynthesis.resume();
    els.tapInstruction.textContent = "Tap or press Space to continue";
  } else {
    // Audio has ended — advance
    handleAdvance();
  }
}

function handleAdvance() {
  if (state.phase === "listening") {
    stopAudio();
    nextItem();
  } else if (state.phase === "wait_response") {
    revealAnswer();
  }
}

els.tapZone.addEventListener("click", () => { dbg("👆 tap zone"); handleTap(); });
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "BUTTON") return;
  if (e.code === "Space") { e.preventDefault(); dbg("⌨ Space"); handleTap(); }
});

els.btnNo.addEventListener("click",    () => rateAnswer(0));
els.btnMaybe.addEventListener("click", () => rateAnswer(1));
els.btnYes.addEventListener("click",   () => rateAnswer(2));

document.addEventListener("keydown", (e) => {
  if (state.phase !== "show_answer") return;
  if (e.code === "KeyN" || e.code === "Digit1") rateAnswer(0);
  if (e.code === "KeyM" || e.code === "Digit2") rateAnswer(1);
  if (e.code === "KeyY" || e.code === "Digit3") rateAnswer(2);
});

els.startBtn.addEventListener("click",    startLesson);
els.continueBtn.addEventListener("click", startLesson);
els.btnRestart.addEventListener("click",  () => showScreen("start"));

// ── MEDIA SESSION API ─────────────────────────────────────
function updateMediaMetadata(item) {
  if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
  const title =
    item.type === "prompt"  ? `Say: "${item.english}"` :
    item.type === "vowel"   ? `Vowel: ${item.vowelLetter}` :
    item.type === "worked"  ? `"${item.english}" → ${item.answer}` :
    getModuleTag(item);
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: "LT Companion · Spanish",
    album:  "Language Transfer",
  });
}

if ("mediaSession" in navigator) {
  // A single headset press is ONE physical gesture, but the OS sends
  // either "play" or "pause" depending on what it believes the playback
  // state is. After a clip ends it believes playback stopped, so it sends
  // "play" — which must mean "continue", not "replay". Routing both
  // actions through handleTap() makes the gesture state-aware:
  //   playing      → pause
  //   paused       → resume
  //   ended        → advance to next item
  //   answer shown → replay the Spanish answer
  navigator.mediaSession.setActionHandler("play", () => {
    dbg("▶ MEDIA: play");
    handleTap();
  });

  navigator.mediaSession.setActionHandler("pause", () => {
    dbg("⏸ MEDIA: pause");
    handleTap();
  });

  // Next = advance (or rate Yes on answer screen). Hardware that reports
  // real track-skip gets the rating immediately, bypassing the press timer.
  navigator.mediaSession.setActionHandler("nexttrack", () => {
    dbg("⏭ MEDIA: nexttrack", state.phase === "show_answer" ? "rate YES" : "advance");
    if (state.phase === "show_answer") {
      clearTimeout(pressTimer); pressCount = 0;
      speakCue("Got it.", () => rateAnswer(2));
    } else handleAdvance();
  });

  // Prev = rate No on answer screen; replay on listen screen
  navigator.mediaSession.setActionHandler("previoustrack", () => {
    dbg("⏮ MEDIA: previoustrack", state.phase === "show_answer" ? "rate NO" : "replay");
    if (state.phase === "show_answer") {
      clearTimeout(pressTimer); pressCount = 0;
      speakCue("We'll come back to that.", () => rateAnswer(0));
    }
    else if (state.currentItem) {
      stopAudio();
      if (state.phase === "listening") showListenItem(state.currentItem);
      else if (state.phase === "wait_response") showPrompt(state.currentItem);
    }
  });

  // Diagnostic only — these reveal what your hardware actually sends.
  // Some headsets/car controls emit seek instead of track-skip.
  ["seekbackward", "seekforward", "seekto", "stop"].forEach((action) => {
    try {
      navigator.mediaSession.setActionHandler(action, () => {
        dbg("⚙ MEDIA: " + action, "(unmapped)");
      });
    } catch (e) {
      dbg("⚠ unsupported action", action);
    }
  });
}

// Update media session playback state on audio events
lessonAudio.addEventListener("play",  () => {
  dbg("🔊 audio play", lessonAudio.src.split("/").pop());
  if ("mediaSession" in navigator)
    navigator.mediaSession.playbackState = "playing";
});
lessonAudio.addEventListener("pause", () => {
  dbg("🔇 audio pause");
  if ("mediaSession" in navigator)
    navigator.mediaSession.playbackState = "paused";
});
lessonAudio.addEventListener("ended", () => dbg("⏹ audio ended"));
lessonAudio.addEventListener("error", () => dbg("❌ audio error", lessonAudio.src.split("/").pop()));
document.addEventListener("visibilitychange", () =>
  dbg("👁 visibility", document.visibilityState));

// ── INIT ─────────────────────────────────────────────────
(function init() {
  if (Object.keys(state.progress).length > 0)
    els.continueBtn.classList.remove("hidden");
  applyCC();

  if (DEBUG) {
    document.getElementById("debug-panel").classList.add("debug-on");
    document.body.classList.add("debug-active");
    dbg("🚀 BUILD", BUILD);
    dbg("mediaSession", ("mediaSession" in navigator) ? "supported" : "NOT SUPPORTED");
    dbg("secure context", String(window.isSecureContext));
    dbgState();
  }
})();
