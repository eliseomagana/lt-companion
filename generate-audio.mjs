#!/usr/bin/env node
/**
 * LT Companion — audio generator
 *
 * Reads LESSON_ITEMS out of app.js and synthesizes one MP3 per item into
 * audio/<id>.mp3, so the filename contract the app relies on is maintained
 * automatically.
 *
 * WHY THIS EXISTS: 34 of 38 items embed Spanish words inside English
 * sentences. An English voice mispronounces them, which is actively harmful
 * in an app teaching pronunciation. This script wraps known Spanish terms in
 * SSML <lang> tags so the engine switches phonetics mid-sentence.
 *
 * It also hashes each item's text into a manifest, so re-running only
 * regenerates what actually changed.
 *
 *   node tools/generate-audio.mjs --dry          # print SSML, call nothing
 *   node tools/generate-audio.mjs                # generate changed items
 *   node tools/generate-audio.mjs --force        # regenerate everything
 *   node tools/generate-audio.mjs --only vowel_a # one item
 *   node tools/generate-audio.mjs --answers      # answer clips only
 *
 * Azure (recommended — real SSML language switching, 500k chars/mo free):
 *   export TTS_PROVIDER=azure
 *   export AZURE_SPEECH_KEY=...
 *   export AZURE_SPEECH_REGION=westus2
 *
 * OpenAI (simpler, no SSML — relies on the model handling Spanish itself):
 *   export TTS_PROVIDER=openai
 *   export OPENAI_API_KEY=...
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// Works whether this file sits at the project root or in tools/ —
// find the directory that actually contains app.js.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = fs.existsSync(path.join(HERE, "app.js"))
  ? HERE
  : path.resolve(HERE, "..");
if (!fs.existsSync(path.join(ROOT, "app.js"))) {
  console.error(`Could not find app.js near ${HERE}. Run this from your project.`);
  process.exit(1);
}
const AUDIO_DIR = path.join(ROOT, "audio");
const ANSWER_DIR = path.join(AUDIO_DIR, "answers");
const UI_DIR = path.join(AUDIO_DIR, "ui");
const MANIFEST = path.join(ROOT, ".audio-manifest.json");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const ANSWERS_ONLY = args.includes("--answers");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const PROVIDER = process.env.TTS_PROVIDER || "azure";

// Voices. Keep these stable across regenerations — a voice change mid-study
// is a confound your participants will notice.
const EN_VOICE = process.env.TTS_EN_VOICE || "en-US-AndrewMultilingualNeural";
const ES_VOICE = process.env.TTS_ES_VOICE || "es-MX-JorgeNeural";
const RATE     = process.env.TTS_RATE     || "-15%";  // slow: this is instruction
const ANSWER_RATE = process.env.TTS_ANSWER_RATE || "-8%";  // native voice paces well here

// Isolated vowel sounds. Caption spellings like "ah" are English guesses, so
// the voice gets exact Spanish IPA instead, with room around each sound.
// A sound ending a sentence or a list gets the long pause; one mid-sentence
// ("Always "ah," like…") only a short one.
const VOWEL_IPA = { ah: "a", eh: "e", ee: "i", oh: "o", oo: "u" };
const VOWEL_LETTERS = new Set(["A", "E", "I", "O", "U"]);
const VOWEL_RE = /(?<![\p{L}-])(ah|eh|ee|oh|oo)(?![\p{L}-])/gu;
const VOWEL_END_RE = /^(?:"?\.|,\s*(?:ah|eh|ee|oh|oo)(?!\p{L}))/u;
const PAUSE_LONG = "1000ms";
const PAUSE_SHORT = "300ms";

function vowelSsml(text, ipa, pause) {
  return `<lang xml:lang="es-MX"><phoneme alphabet="ipa" ph="${ipa}">${text}</phoneme></lang>`
       + `<break time="${pause}"/>`;
}

// Words that must NEVER be auto-tagged as Spanish, because they are also
// ordinary English words or English function words. Without this, "no accent
// mark is needed" gets read in Spanish because "no" appears in an answer.
// Auto-tagging is a heuristic; this is where it gets corrected.
const NEVER_AUTO = new Set([
  "no", "a", "e", "i", "o", "u", "y", "en", "la", "el", "lo", "si", "me",
  "total", "normal", "animal", "metal", "natural", "hospital", "general",
  "capital", "local", "final", "central", "real", "material",
]);

// Manual override, for the cases the heuristic can't resolve:
//   {{es:palabra}}        force Spanish      {{en:word}}  force English
//   {{ipa:shown|ipa}}     say exact Spanish IPA, show `shown`
//   {{say:shown|spoken}}  say `spoken` (English), show `shown`
// Use these inside a caption whenever an identical spelling needs a
// specific language, e.g. contrasting English "normal" with Spanish "normal".
// app.js's stripLangMarkers() must accept every form listed here.
const OVERRIDE_RE = /\{\{(es|en|ipa|say):([^}|]+)(?:\|([^}]+))?\}\}/gi;

// ── Pronunciation dictionary ─────────────────────────────────────────
// pronunciations.json fixes a spelling everywhere it appears, e.g. "-ción",
// which the English voice read as "cyan". Each entry is
//   { "match": "-ción", "lang": "es", "ipa": "sjon" }   exact sound
//   { "match": "→", "say": "becomes" }                   spoken substitute
// Edit it by hand or in the review tool (node review.mjs).
const PRONUNCIATIONS = path.join(ROOT, "pronunciations.json");

function loadPronunciations() {
  try { return JSON.parse(fs.readFileSync(PRONUNCIATIONS, "utf8")); } catch { return []; }
}

const escapeAttr = (s) => escapeXml(s).replace(/"/g, "&quot;");

function phonemeSsml(text, ipa, lang = "es") {
  return `<lang xml:lang="${lang === "en" ? "en-US" : "es-MX"}">`
       + `<phoneme alphabet="ipa" ph="${escapeAttr(ipa)}">${text}</phoneme></lang>`;
}

// ── Spanish glossary ──────────────────────────────────────────────────
// Words that must be spoken with Spanish phonetics even inside an English
// sentence. Every `answer` field is added automatically; these are the extras
// that only appear inside caption prose.
const EXTRA_SPANISH = [
  "casa", "gracias", "leche", "nombre", "libro", "hola", "poco", "mucho",
  "sí", "tú", "España", "español", "escuela", "estudiante", "especial",
  "hora", "hombre", "comer", "como", "hablar", "querer", "necesitar",
  "usar", "quiero", "necesito", "uso", "hablo", "usarlo", "nación",
  "estación", "conversación", "información", "comunicación", "eléctrico",
  "público", "histórico", "normal", "natural", "metal", "animal", "total",
  "hospital",
];

// ── Read LESSON_ITEMS out of app.js ───────────────────────────────────
function loadItems() {
  const src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const m = src.match(/const LESSON_ITEMS = (\[[\s\S]*?\n\];)/);
  if (!m) throw new Error("Could not find LESSON_ITEMS in app.js");
  return eval(m[1].slice(0, -1));
}

// ── Build the spoken script for one item ──────────────────────────────
// The caption is the lesson text. Prompts get a spoken question instead,
// since showing the learner the answer would defeat the exercise.
function scriptFor(item) {
  if (item.type === "prompt") return `How do you say: ${item.english}`;
  return item.caption || "";
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Wrap each Spanish term in <lang>. Longest-first so "necesitar" is matched
// before "necesito" can partially claim it. Placeholders prevent the tags
// themselves from being re-scanned.
function markupSpanish(text, glossary, dictionary = []) {
  const sorted = [...new Set(glossary)]
    .filter((w) => w.length >= 3 && !NEVER_AUTO.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  const slots = [];
  const slot = (ssml) => `\u0000${slots.push(ssml) - 1}\u0000`;
  let out = escapeXml(text);

  // Explicit overrides win and are locked in before auto-tagging runs,
  // so the heuristic can't touch or double-wrap them.
  out = out.replace(OVERRIDE_RE, (_, kind, inner, extra) => {
    kind = kind.toLowerCase();
    if (kind === "ipa") return slot(phonemeSsml(inner, extra || inner));
    if (kind === "say") return slot(`<sub alias="${escapeAttr(extra || inner)}">${inner}</sub>`);
    if (kind === "en") return slot(`<lang xml:lang="en-US">${inner}</lang>`);
    return slot(VOWEL_LETTERS.has(inner)
      ? vowelSsml(inner, inner.toLowerCase(), PAUSE_LONG)
      : `<lang xml:lang="es-MX">${inner}</lang>`);
  });

  // Dictionary next, longest match first so "-ción" beats "-o".
  for (const entry of [...dictionary].sort((a, b) => b.match.length - a.match.length)) {
    const re = new RegExp(
      `(?<![\\p{L}\\p{M}])${escapeXml(entry.match).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{M}])`,
      "gu"
    );
    out = out.replace(re, (hit) => slot(entry.say
      ? `<sub alias="${escapeAttr(entry.say)}">${hit}</sub>`
      : phonemeSsml(hit, entry.ipa, entry.lang)));
  }

  out = out.replace(VOWEL_RE, (hit, _sound, offset, whole) => {
    const token = `\u0000${slots.length}\u0000`;
    const ending = VOWEL_END_RE.test(whole.slice(offset + hit.length));
    slots.push(vowelSsml(hit, VOWEL_IPA[hit], ending ? PAUSE_LONG : PAUSE_SHORT));
    return token;
  });

  for (const term of sorted) {
    // Unicode-aware boundaries: \b breaks on accented characters.
    const re = new RegExp(
      `(^|[^\\p{L}\\p{M}])(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=[^\\p{L}\\p{M}]|$)`,
      "giu"
    );
    out = out.replace(re, (full, pre, hit) => {
      const token = `\u0000${slots.length}\u0000`;
      // Azure forbids nested <voice>; <lang> inside a multilingual voice is
      // the supported way to switch phonetics mid-sentence.
      slots.push(`<lang xml:lang="es-MX">${hit}</lang>`);
      return pre + token;
    });
  }

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i]);
}

function buildSsml(item, glossary, dictionary) {
  const body = markupSpanish(scriptFor(item), glossary, dictionary);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" `
       + `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">`
       + `<voice name="${EN_VOICE}"><prosody rate="${RATE}">${body}</prosody></voice>`
       + `</speak>`;
}

// Spoken interface cues. They play through lessonAudio like everything else,
// because device speech goes silent once the screen locks.
const UI_CUES = {
  how_did_you_do: "How'd you do?",
  got_it:    "Got it.",
  come_back: "We'll come back to that.",
};

function buildCueSsml(text) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">`
       + `<voice name="${EN_VOICE}"><prosody rate="${RATE}">${escapeXml(text)}</prosody></voice>`
       + `</speak>`;
}

// The model answer on the answer screen is pure Spanish, so it gets the
// native voice rather than a <lang> span inside the English one.
function buildAnswerSsml(item) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-MX">`
       + `<voice name="${ES_VOICE}"><prosody rate="${ANSWER_RATE}">${escapeXml(item.answer)}</prosody></voice>`
       + `</speak>`;
}

// ── Providers ─────────────────────────────────────────────────────────
async function synthAzure(ssml) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION");

  const res = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "lt-companion",
      },
      body: ssml,
    }
  );
  if (!res.ok) throw new Error(`Azure ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function synthOpenAI(_ssml, plainText) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Set OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "tts-1-hd",
      voice: process.env.OPENAI_TTS_VOICE || "onyx",
      input: plainText,          // no SSML support — the model guesses
      response_format: "mp3",
      speed: 0.95,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// Every answer is Spanish by definition; fold those into the glossary.
function makeGlossary(items) {
  return [
    ...EXTRA_SPANISH,
    ...items.flatMap((i) => (i.answer ? i.answer.split(/\s+/) : [])),
  ].filter((w) => w && w.length > 1);
}

// The review tool imports these to preview SSML exactly as it will be sent.
export { ROOT, loadItems, makeGlossary, loadPronunciations, buildSsml, buildAnswerSsml };

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
const items = loadItems();
const glossary = makeGlossary(items);
const dictionary = loadPronunciations();

let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch {}

fs.mkdirSync(ANSWER_DIR, { recursive: true });
fs.mkdirSync(UI_DIR, { recursive: true });

let made = 0, skipped = 0, failed = 0;

// Lesson clips first, then one answer clip per prompt. Answer manifest keys
// are prefixed so an item's two clips are tracked separately.
const jobs = [
  ...(ANSWERS_ONLY ? [] : items.map((item) => ({
    id: item.id,
    key: item.id,
    plain: scriptFor(item),
    ssml: buildSsml(item, glossary, dictionary),
    dest: path.join(AUDIO_DIR, `${item.id}.mp3`),
  }))),
  ...items.filter((item) => item.type === "prompt").map((item) => ({
    id: item.id,
    key: `answers/${item.id}`,
    plain: item.answer,
    ssml: buildAnswerSsml(item),
    dest: path.join(ANSWER_DIR, `${item.id}.mp3`),
  })),
  ...(ANSWERS_ONLY ? [] : Object.entries(UI_CUES).map(([name, text]) => ({
    id: `cue_${name}`,
    key: `ui/cue_${name}`,
    plain: text,
    ssml: buildCueSsml(text),
    dest: path.join(UI_DIR, `cue_${name}.mp3`),
  }))),
];

for (const { id, key, plain, ssml, dest } of jobs) {
  if (ONLY && id !== ONLY) continue;

  if (!plain.trim()) { console.log(`—  ${key} (no script)`); continue; }

  const hash = crypto.createHash("sha1")
    .update(ssml + EN_VOICE + ES_VOICE + RATE + PROVIDER).digest("hex").slice(0, 12);

  if (DRY) {
    console.log(`\n=== ${key} ===\n${ssml}`);
    continue;
  }

  if (!FORCE && manifest[key] === hash && fs.existsSync(dest)) {
    skipped++;
    continue;
  }

  try {
    const buf = PROVIDER === "openai"
      ? await synthOpenAI(ssml, plain)
      : await synthAzure(ssml);
    fs.writeFileSync(dest, buf);
    manifest[key] = hash;
    made++;
    console.log(`✓  ${key}  (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    failed++;
    console.error(`✗  ${key}  ${e.message}`);
  }
}

if (!DRY) {
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`\n${made} generated · ${skipped} unchanged · ${failed} failed`);
  if (failed) process.exitCode = 1;
}
}

// Run only when executed directly, not when imported by review.mjs.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
