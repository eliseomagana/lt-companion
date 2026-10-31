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
const MANIFEST = path.join(ROOT, ".audio-manifest.json");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const PROVIDER = process.env.TTS_PROVIDER || "azure";

// Voices. Keep these stable across regenerations — a voice change mid-study
// is a confound your participants will notice.
const EN_VOICE = process.env.TTS_EN_VOICE || "en-US-AndrewMultilingualNeural";
const ES_VOICE = process.env.TTS_ES_VOICE || "es-MX-JorgeNeural";
const RATE     = process.env.TTS_RATE     || "-8%";   // slightly slow: this is instruction

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
//   {{es:palabra}}  force Spanish      {{en:word}}  force English
// Use these inside a caption whenever an identical spelling needs a
// specific language, e.g. contrasting English "normal" with Spanish "normal".
const OVERRIDE_RE = /\{\{(es|en):([^}]+)\}\}/gi;

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
function markupSpanish(text, glossary) {
  const sorted = [...new Set(glossary)]
    .filter((w) => w.length >= 3 && !NEVER_AUTO.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  const slots = [];
  let out = escapeXml(text);

  // Explicit overrides win and are locked in before auto-tagging runs,
  // so the heuristic can't touch or double-wrap them.
  out = out.replace(OVERRIDE_RE, (_, lang, inner) => {
    const token = `\u0000${slots.length}\u0000`;
    slots.push(
      lang.toLowerCase() === "es"
        ? `<lang xml:lang="es-MX">${inner}</lang>`
        : `<lang xml:lang="en-US">${inner}</lang>`
    );
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

function buildSsml(item, glossary) {
  const body = markupSpanish(scriptFor(item), glossary);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" `
       + `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">`
       + `<voice name="${EN_VOICE}"><prosody rate="${RATE}">${body}</prosody></voice>`
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

// ── Main ──────────────────────────────────────────────────────────────
const items = loadItems();

// Every answer is Spanish by definition; fold those into the glossary.
const glossary = [
  ...EXTRA_SPANISH,
  ...items.flatMap((i) => (i.answer ? i.answer.split(/\s+/) : [])),
].filter((w) => w && w.length > 1);

let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch {}

fs.mkdirSync(AUDIO_DIR, { recursive: true });

let made = 0, skipped = 0, failed = 0;

for (const item of items) {
  if (ONLY && item.id !== ONLY) continue;

  const plain = scriptFor(item);
  if (!plain.trim()) { console.log(`—  ${item.id} (no script)`); continue; }

  const ssml = buildSsml(item, glossary);
  const hash = crypto.createHash("sha1")
    .update(ssml + EN_VOICE + ES_VOICE + RATE + PROVIDER).digest("hex").slice(0, 12);
  const dest = path.join(AUDIO_DIR, `${item.id}.mp3`);

  if (DRY) {
    console.log(`\n=== ${item.id} ===\n${ssml}`);
    continue;
  }

  if (!FORCE && manifest[item.id] === hash && fs.existsSync(dest)) {
    skipped++;
    continue;
  }

  try {
    const buf = PROVIDER === "openai"
      ? await synthOpenAI(ssml, plain)
      : await synthAzure(ssml);
    fs.writeFileSync(dest, buf);
    manifest[item.id] = hash;
    made++;
    console.log(`✓  ${item.id}  (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    failed++;
    console.error(`✗  ${item.id}  ${e.message}`);
  }
}

if (!DRY) {
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`\n${made} generated · ${skipped} unchanged · ${failed} failed`);
  if (failed) process.exitCode = 1;
}
