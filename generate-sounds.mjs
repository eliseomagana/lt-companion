#!/usr/bin/env node
/**
 * LT Companion — wait-sound generator
 *
 * Synthesizes the soft background sound that plays while the app waits for
 * a response, as audio/ui/wait_prompt.wav and audio/ui/wait_report.wav.
 * No API, no dependencies: plain sine synthesis written as 16-bit WAV.
 *
 * WHY THIS EXISTS: with the screen off, nothing on screen says time is
 * passing, and silence lets the phone drop its media controls. A quiet pad
 * keeps the media session alive, and a soft chime near the end says "time is
 * nearly up" without the pressure of a ticking clock.
 *
 * Each track is exactly as long as its timeout, read from app.js, because the
 * app uses the track's `ended` event as the timeout itself. Timers can be
 * delayed with the screen off; audio events are not.
 *
 *   node generate-sounds.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, "audio", "ui");
const SAMPLE_RATE = 22050;

// Tuning. Keep the pad well under speech level: it should be noticed only
// when the room is otherwise quiet.
const PAD_NOTES   = [196.0, 293.66, 392.0];  // G3, D4, G4: open fifths, no tension
const PAD_LEVEL   = 0.045;
const BREATH_HZ   = 0.18;                    // slow swell, roughly a calm breath
const CHIME_NOTES = [659.25, 783.99];        // E5 then G5, rising and gentle
const CHIME_LEVEL = 0.16;
const CHIME_GAP   = 0.38;                    // seconds between the two notes
const CHIME_DECAY = 1.1;                     // seconds to fade each note
const CHIME_LEAD  = 3.0;                     // seconds before the end the chime sounds
const FADE_IN     = 1.2;
const FADE_OUT    = 0.6;

function readTimeout(name) {
  const src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`Could not find ${name} in app.js`);
  return Number(m[1]) / 1000;
}

function synth(seconds) {
  const n = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  const chimeAt = Math.max(0, seconds - CHIME_LEAD);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const breath = 0.65 + 0.35 * Math.sin(2 * Math.PI * BREATH_HZ * t - Math.PI / 2);
    const env = Math.min(1, t / FADE_IN, (seconds - t) / FADE_OUT);
    let pad = 0;
    for (const f of PAD_NOTES) pad += Math.sin(2 * Math.PI * f * t);
    let s = (pad / PAD_NOTES.length) * PAD_LEVEL * breath * env;

    CHIME_NOTES.forEach((f, k) => {
      const ct = t - (chimeAt + k * CHIME_GAP);
      if (ct < 0) return;
      // Short attack avoids a click; the soft second partial makes it a bell.
      const attack = Math.min(1, ct / 0.015);
      const decay = Math.exp(-ct / (CHIME_DECAY / 3));
      const tone = Math.sin(2 * Math.PI * f * ct) + 0.25 * Math.sin(2 * Math.PI * f * 2 * ct);
      s += (tone / 1.25) * CHIME_LEVEL * attack * decay * Math.max(0, env);
    });

    out[i] = s;
  }
  return out;
}

function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, constant] of [["wait_prompt", "PROMPT_TIMEOUT"], ["wait_report", "REPORT_TIMEOUT"]]) {
  const seconds = readTimeout(constant);
  const wav = toWav(synth(seconds));
  fs.writeFileSync(path.join(OUT_DIR, `${name}.wav`), wav);
  console.log(`✓  ${name}.wav  ${seconds}s  (${(wav.length / 1024).toFixed(0)} KB)`);
}
