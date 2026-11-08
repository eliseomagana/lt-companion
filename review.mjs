#!/usr/bin/env node
/**
 * LT Companion — script & pronunciation review tool (local only)
 *
 *   node --env-file=.env review.mjs        then open http://127.0.0.1:5500
 *
 * Walk every clip in lesson order: listen, see exactly what the voice is
 * sent (Spanish spans, IPA, substitutions, pauses highlighted), edit the
 * script, save it back into app.js, and regenerate that one clip. Review
 * status and notes go to review-notes.json; dictionary fixes that apply
 * everywhere go to pronunciations.json.
 *
 * Runs on 127.0.0.1 only and needs no dependencies. Without an Azure key it
 * still works for listening, editing and notes; only regeneration is off.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  ROOT, loadItems, makeGlossary, loadPronunciations, buildSsml, buildAnswerSsml,
} from "./generate-audio.mjs";

const PORT = Number(process.env.REVIEW_PORT) || 5500;
const APP = path.join(ROOT, "app.js");
const NOTES = path.join(ROOT, "review-notes.json");
const DICT = path.join(ROOT, "pronunciations.json");
const EDITABLE = ["caption", "english", "answer", "hint"];

// ── Data ──────────────────────────────────────────────────────────────
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

// Module names come from the section comments in LESSON_ITEMS, so the
// grouping here can't drift from what's in the file.
function moduleOf() {
  const map = {};
  let current = "";
  for (const line of fs.readFileSync(APP, "utf8").split("\n")) {
    const m = line.match(/\/\/ ── (MODULE \d+: .+?) ─/);
    if (m) current = m[1];
    const id = line.match(/^\s+id: "([^"]+)",/);
    if (id) map[id[1]] = current;
  }
  return map;
}

function snapshot() {
  const items = loadItems();
  const glossary = makeGlossary(items);
  const dict = loadPronunciations();
  const modules = moduleOf();
  return {
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      module: modules[item.id] || "",
      caption: item.caption ?? null,
      english: item.english ?? null,
      answer: item.answer ?? null,
      hint: item.hint ?? null,
      ssml: buildSsml(item, glossary, dict),
      answerSsml: item.type === "prompt" ? buildAnswerSsml(item) : null,
    })),
    dict,
    notes: readJson(NOTES, {}),
    hasKey: !!process.env.AZURE_SPEECH_KEY,
  };
}

// ── Writing app.js ────────────────────────────────────────────────────
// Replace one field inside one item's object literal, then re-parse the
// file and confirm the new value round-trips. Anything off and the original
// is put back, so a bad edit can't leave app.js broken.
const STRING_RE = "(`(?:[^`\\\\]|\\\\[\\s\\S])*`|\"(?:[^\"\\\\]|\\\\.)*\")";

function toLiteral(field, value) {
  if (field === "caption" || field === "hint") {
    return "`" + value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
  }
  return JSON.stringify(value);
}

function saveFields(id, fields) {
  const original = fs.readFileSync(APP, "utf8");
  const anchor = `    id: "${id}",\n`;
  const start = original.indexOf(anchor);
  if (start < 0) throw new Error(`No item with id ${id}`);
  const end = original.indexOf("\n  },", start);
  let block = original.slice(start, end);

  for (const [field, value] of Object.entries(fields)) {
    if (!EDITABLE.includes(field)) throw new Error(`${field} is not editable`);
    const re = new RegExp(`(\\n    ${field}: )${STRING_RE},`);
    if (!re.test(block)) throw new Error(`${id} has no ${field} field to edit`);
    block = block.replace(re, (_, pre) => `${pre}${toLiteral(field, value)},`);
  }

  fs.writeFileSync(APP, original.slice(0, start) + block + original.slice(end));
  try {
    const item = loadItems().find((i) => i.id === id);
    for (const [field, value] of Object.entries(fields)) {
      if (item[field] !== value) throw new Error(`${field} did not round-trip`);
    }
  } catch (e) {
    fs.writeFileSync(APP, original);
    throw new Error(`Edit rejected, app.js unchanged: ${e.message}`);
  }
}

// Preview SSML for unsaved edits without touching the file.
function previewSsml(id, fields) {
  const items = loadItems();
  const item = { ...items.find((i) => i.id === id), ...fields };
  const glossary = makeGlossary(items.map((i) => (i.id === id ? item : i)));
  return {
    ssml: buildSsml(item, glossary, loadPronunciations()),
    answerSsml: item.type === "prompt" ? buildAnswerSsml(item) : null,
  };
}

// ── Generating ────────────────────────────────────────────────────────
// Runs the real generator so the manifest and file names stay its job.
function generate(id) {
  return new Promise((resolve) => {
    const args = [path.join(ROOT, "generate-audio.mjs"), ...(id ? ["--only", id] : [])];
    const child = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
    let output = "";
    child.stdout.on("data", (d) => { output += d; });
    child.stderr.on("data", (d) => { output += d; });
    child.on("close", (code) => resolve({ ok: code === 0, output: output.trim() }));
  });
}

// ── HTTP ──────────────────────────────────────────────────────────────
const TYPES = { ".mp3": "audio/mpeg", ".wav": "audio/wav" };

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); } });
  });
}

const routes = {
  "GET /api/state": () => snapshot(),
  "POST /api/preview": ({ id, fields }) => previewSsml(id, fields || {}),
  "POST /api/save": ({ id, fields }) => { saveFields(id, fields || {}); return snapshot(); },
  "POST /api/generate": async ({ id }) => ({ ...(await generate(id)), state: snapshot() }),
  "POST /api/dict": ({ entries }) => {
    if (!Array.isArray(entries) || entries.some((e) => !e.match || !(e.ipa || e.say)))
      throw new Error("Each entry needs a match and either ipa or say");
    fs.writeFileSync(DICT, JSON.stringify(entries, null, 2) + "\n");
    return snapshot();
  },
  "POST /api/notes": ({ id, status, note }) => {
    const notes = readJson(NOTES, {});
    notes[id] = { ...(notes[id] || {}), status, note, updated: new Date().toISOString() };
    fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");
    return notes;
  },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return send(res, 200, await route(req.method === "POST" ? await readBody(req) : {}));

    if (req.method === "GET" && url.pathname === "/") return send(res, 200, PAGE, "text/html; charset=utf-8");

    if (req.method === "GET" && url.pathname.startsWith("/audio/")) {
      const file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
      if (file.startsWith(path.join(ROOT, "audio")) && fs.existsSync(file)) {
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        return fs.createReadStream(file).pipe(res);
      }
    }
    send(res, 404, { error: "Not found" });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Review tool: http://127.0.0.1:${PORT}`);
  if (!process.env.AZURE_SPEECH_KEY) console.log("No AZURE_SPEECH_KEY: listening and editing only. Start with --env-file=.env to regenerate.");
});

// ── Page ──────────────────────────────────────────────────────────────
const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LT Script Review</title>
<style>
  :root {
    --bg: #eef0fb; --surface: #fff; --surface2: #f5f6fd; --border: #e2e5f3;
    --text: #1e2352; --muted: #6b7299; --accent: #7b6cf6; --accent-bg: rgba(123,108,246,.10);
    --es: #0f8a7e; --es-bg: rgba(62,207,196,.16); --en: #8b5e00; --en-bg: rgba(246,153,63,.16);
    --ipa: #6a4bd8; --ipa-bg: rgba(123,108,246,.16); --say: #b0305a; --say-bg: rgba(227,52,90,.12);
    --ok: #2f9e5f; --warn: #d9821e; --flag: #d6453d;
    --font: system-ui, -apple-system, "Segoe UI", sans-serif; --mono: ui-monospace, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1020; --surface: #181a2e; --surface2: #1f2240; --border: #2a2d4a;
      --text: #e6e8f8; --muted: #8b90b8; --accent: #8a7bff; --accent-bg: rgba(138,123,255,.14);
      --es: #5fe0d4; --es-bg: rgba(78,207,202,.16); --en: #f5b75c; --en-bg: rgba(237,137,54,.16);
      --ipa: #b3a6ff; --ipa-bg: rgba(138,123,255,.2); --say: #ff8fb0; --say-bg: rgba(252,129,160,.14);
      --ok: #48bb78; --warn: #ed8936; --flag: #fc8181;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 var(--font); }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; padding: .9rem 1.25rem;
    border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 2; }
  header h1 { font-size: 1rem; margin: 0 auto 0 0; }
  button { font: inherit; font-size: .85rem; padding: .4rem .85rem; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  button:hover { border-color: var(--accent); }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button:disabled { opacity: .5; cursor: default; }
  select, textarea, input { font: inherit; color: var(--text); background: var(--surface2);
    border: 1px solid var(--border); border-radius: 10px; padding: .45rem .6rem; }
  main { display: grid; grid-template-columns: minmax(220px, 300px) 1fr; min-height: calc(100vh - 58px); }
  @media (max-width: 760px) { main { grid-template-columns: 1fr; } nav { max-height: 40vh; } }
  nav { border-right: 1px solid var(--border); overflow-y: auto; padding: .75rem; background: var(--surface); }
  nav h2 { font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin: .9rem .4rem .3rem; }
  nav a { display: flex; align-items: center; gap: .5rem; padding: .35rem .5rem; border-radius: 8px;
    color: var(--text); text-decoration: none; font-size: .85rem; cursor: pointer; }
  nav a:hover { background: var(--surface2); }
  nav a.active { background: var(--accent-bg); }
  .dot { width: .55rem; height: .55rem; border-radius: 50%; flex-shrink: 0; background: var(--border); }
  .dot.ok { background: var(--ok); } .dot.needs_work { background: var(--warn); } .dot.flagged { background: var(--flag); }
  section { padding: 1.25rem; max-width: 900px; width: 100%; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1rem 1.1rem; margin-bottom: 1rem; }
  .card h3 { margin: 0 0 .6rem; font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .title { display: flex; flex-wrap: wrap; align-items: baseline; gap: .6rem; margin-bottom: 1rem; }
  .title strong { font: 600 1.1rem var(--mono); }
  .muted { color: var(--muted); font-size: .85rem; }
  audio { width: 100%; margin: .2rem 0 .4rem; }
  .spoken { white-space: pre-wrap; line-height: 1.9; }
  .spoken span { border-radius: 4px; padding: 0 .15rem; }
  .s-es { background: var(--es-bg); color: var(--es); }
  .s-en { background: var(--en-bg); color: var(--en); }
  .s-ipa { background: var(--ipa-bg); color: var(--ipa); }
  .s-say { background: var(--say-bg); color: var(--say); }
  .s-brk { color: var(--muted); font: .7rem var(--mono); }
  .legend { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .6rem; font-size: .75rem; }
  .legend span { border-radius: 4px; padding: .05rem .4rem; }
  label { display: block; font-size: .78rem; color: var(--muted); margin: .7rem 0 .25rem; }
  textarea { width: 100%; min-height: 9rem; resize: vertical; line-height: 1.5; }
  input[type=text] { width: 100%; }
  .row { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-top: .75rem; }
  .status-btn.on { border-color: currentColor; font-weight: 600; }
  .status-btn[data-s=ok] { color: var(--ok); } .status-btn[data-s=needs_work] { color: var(--warn); } .status-btn[data-s=flagged] { color: var(--flag); }
  pre.log { white-space: pre-wrap; font: .78rem var(--mono); background: var(--surface2); padding: .6rem; border-radius: 8px; max-height: 14rem; overflow: auto; margin: .6rem 0 0; }
  details summary { cursor: pointer; color: var(--muted); font-size: .85rem; }
  code { font: .82rem var(--mono); background: var(--surface2); padding: .05rem .3rem; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; }
  td, th { padding: .3rem; text-align: left; vertical-align: middle; }
  th { color: var(--muted); font-weight: 600; font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; }
  td input, td select { width: 100%; }
  .dirty { color: var(--warn); font-size: .8rem; }
  .err { color: var(--flag); }
</style>
</head>
<body>
<header>
  <h1>LT Script Review</h1>
  <span id="progress" class="muted"></span>
  <select id="filter" aria-label="Show">
    <option value="all">All items</option>
    <option value="todo">Not reviewed</option>
    <option value="flagged">Flagged</option>
    <option value="needs_work">Needs work</option>
    <option value="ok">OK</option>
  </select>
  <button id="btn-dict">Pronunciation dictionary</button>
  <button id="btn-regen-all">Regenerate changed clips</button>
</header>
<main>
  <nav id="list"></nav>
  <section id="detail"></section>
</main>

<script>
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...kids.flat(Infinity).filter((k) => k != null));
  return e;
};
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
};

let S = null;           // server state
let current = null;     // selected id, or "__dict"
let audioVersion = Date.now();

// ── What the voice is sent, as readable highlighted text ──
function renderSpoken(ssml) {
  const doc = new DOMParser().parseFromString(ssml, "application/xml");
  const out = h("div", { class: "spoken" });
  const walk = (node, into) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { into.append(n.textContent); continue; }
      if (n.nodeType !== 1) continue;
      const name = n.localName;
      if (name === "lang" && n.getAttribute("xml:lang") === "es-MX" && !n.querySelector("phoneme")) {
        into.append(h("span", { class: "s-es", title: "Spanish" }, n.textContent));
      } else if (name === "lang" && n.getAttribute("xml:lang") === "en-US" && !n.querySelector("phoneme")) {
        into.append(h("span", { class: "s-en", title: "Forced English" }, n.textContent));
      } else if (name === "phoneme") {
        into.append(h("span", { class: "s-ipa", title: "IPA: /" + n.getAttribute("ph") + "/" }, n.textContent + " /" + n.getAttribute("ph") + "/"));
      } else if (name === "sub") {
        into.append(h("span", { class: "s-say", title: "Shown as " + n.textContent }, n.textContent + " → “" + n.getAttribute("alias") + "”"));
      } else if (name === "break") {
        into.append(h("span", { class: "s-brk" }, " ‖" + n.getAttribute("time") + " "));
      } else walk(n, into);
    }
  };
  walk(doc.documentElement, out);
  return out;
}

const legend = () => h("div", { class: "legend" },
  h("span", { class: "s-es" }, "Spanish"), h("span", { class: "s-en" }, "Forced English"),
  h("span", { class: "s-ipa" }, "Exact sound (IPA)"), h("span", { class: "s-say" }, "Says instead"),
  h("span", { class: "s-brk" }, "‖ pause"), h("span", {}, "plain = English voice"));

// ── List ──
function renderList() {
  const filter = $("#filter").value;
  const nav = $("#list");
  nav.replaceChildren();
  let module = null;
  for (const it of S.items) {
    const st = S.notes[it.id]?.status;
    if (filter === "todo" ? st : filter !== "all" && st !== filter) continue;
    if (it.module !== module) { module = it.module; nav.append(h("h2", {}, module)); }
    nav.append(h("a", { class: current === it.id ? "active" : "", onclick: () => select(it.id) },
      h("span", { class: "dot " + (st || "") }), it.id));
  }
  const done = S.items.filter((i) => S.notes[i.id]?.status === "ok").length;
  $("#progress").textContent = done + " / " + S.items.length + " OK";
}

// ── Item detail ──
function fieldsFor(it) {
  if (it.type === "prompt") return ["english", "answer", "hint"];
  if (it.type === "worked") return ["caption", "english", "answer"];
  return ["caption"];
}
const FIELD_HELP = {
  caption: "Spoken script (and on-screen caption)",
  english: it => it.type === "prompt" ? "English prompt, spoken as “How do you say: …”" : "English shown on screen",
  answer: it => it.type === "prompt" ? "Spanish answer (its own clip, native voice)" : "Spanish shown on screen",
  hint: "Hint (screen only, never spoken)",
};

function select(id) {
  current = id;
  history.replaceState(null, "", "#" + id);
  renderList();
  if (id === "__dict") return renderDict();
  const it = S.items.find((i) => i.id === id);
  const note = S.notes[id] || {};
  const idx = S.items.indexOf(it);
  const fields = fieldsFor(it);
  const inputs = {};
  const spoken = h("div", {}, renderSpoken(it.ssml));
  const answerSpoken = h("div", {}, it.answerSsml ? renderSpoken(it.answerSsml) : "");
  const dirty = h("span", { class: "dirty" });
  const log = h("pre", { class: "log", hidden: true });

  let timer;
  const values = () => Object.fromEntries(fields.map((f) => [f, inputs[f].value]));
  const changed = () => fields.filter((f) => inputs[f].value !== (it[f] ?? ""));
  const onInput = () => {
    dirty.textContent = changed().length ? "Unsaved changes" : "";
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const p = await api("POST", "/api/preview", { id, fields: values() });
        spoken.replaceChildren(renderSpoken(p.ssml));
        if (p.answerSsml) answerSpoken.replaceChildren(renderSpoken(p.answerSsml));
      } catch (e) { spoken.replaceChildren(h("p", { class: "err" }, e.message)); }
    }, 250);
  };

  const save = async (regen) => {
    log.hidden = false;
    try {
      if (changed().length) {
        const only = Object.fromEntries(changed().map((f) => [f, inputs[f].value]));
        S = await api("POST", "/api/save", { id, fields: only });
        log.textContent = "Saved to app.js.";
      } else log.textContent = "No text changes.";
      if (regen) {
        log.textContent += "\nGenerating…";
        const r = await api("POST", "/api/generate", { id });
        S = r.state;
        log.textContent += "\n" + r.output;
        audioVersion = Date.now();
      }
      select(id);
      $("pre.log").hidden = false;
      $("pre.log").textContent = log.textContent;
    } catch (e) { log.textContent = "Error: " + e.message; }
  };

  const setNote = async (status) => {
    const text = $("#note").value;
    S.notes = await api("POST", "/api/notes", { id, status, note: text });
    select(id);
  };

  $("#detail").replaceChildren(
    h("div", { class: "title" },
      h("strong", {}, it.id), h("span", { class: "muted" }, it.type + " · " + it.module + " · " + (idx + 1) + " of " + S.items.length),
      h("span", { style: "margin-left:auto" },
        h("button", { disabled: idx === 0, onclick: () => select(S.items[idx - 1].id) }, "← Prev"), " ",
        h("button", { disabled: idx === S.items.length - 1, onclick: () => select(S.items[idx + 1].id) }, "Next →"))),

    h("div", { class: "card" },
      h("h3", {}, "Listen"),
      h("audio", { controls: true, preload: "none", src: "/audio/" + it.id + ".mp3?v=" + audioVersion }),
      it.answerSsml ? [h("div", { class: "muted" }, "Answer clip"),
        h("audio", { controls: true, preload: "none", src: "/audio/answers/" + it.id + ".mp3?v=" + audioVersion })] : null),

    h("div", { class: "card" },
      h("h3", {}, "What the voice is sent"),
      spoken,
      it.answerSsml ? [h("div", { class: "muted", style: "margin-top:.6rem" }, "Answer:"), answerSpoken] : null,
      legend()),

    h("div", { class: "card" },
      h("h3", {}, "Edit"),
      fields.map((f) => {
        const help = typeof FIELD_HELP[f] === "function" ? FIELD_HELP[f](it) : FIELD_HELP[f];
        inputs[f] = f === "caption"
          ? h("textarea", { oninput: onInput })
          : h("input", { type: "text", oninput: onInput });
        inputs[f].value = it[f] ?? "";
        return [h("label", {}, help), inputs[f]];
      }),
      h("div", { class: "row" },
        h("button", { onclick: () => save(false) }, "Save to app.js"),
        h("button", { class: "primary", disabled: !S.hasKey, onclick: () => save(true),
          title: S.hasKey ? "" : "Start the tool with --env-file=.env to regenerate" }, "Save & regenerate clip"),
        dirty),
      log,
      h("details", { style: "margin-top:.75rem" },
        h("summary", {}, "Markers you can use in the script"),
        h("p", { class: "muted" },
          h("code", {}, "{{es:palabra}}"), " say in Spanish · ",
          h("code", {}, "{{en:word}}"), " force English · ",
          h("code", {}, "{{ipa:-ción|sjon}}"), " exact Spanish sound, shows the first part · ",
          h("code", {}, "{{say:→|becomes}}"), " say something else, shows the first part. ",
          "For a fix that should apply everywhere, use the pronunciation dictionary instead."))),

    h("div", { class: "card" },
      h("h3", {}, "Review"),
      h("div", { class: "row", style: "margin-top:0" },
        ["ok", "needs_work", "flagged"].map((s) => h("button", {
          class: "status-btn" + (note.status === s ? " on" : ""), "data-s": s, onclick: () => setNote(s),
        }, { ok: "✓ OK", needs_work: "Needs work", flagged: "⚑ Flagged" }[s]))),
      h("label", { for: "note" }, "Notes (saved with the status, or on leaving the box)"),
      h("textarea", { id: "note", style: "min-height:5rem", onchange: () => setNote(note.status || "needs_work") }))
  );
  $("#note").value = note.note || "";
}

// ── Pronunciation dictionary ──
function renderDict() {
  const rows = S.dict.map((e) => ({ ...e }));
  const body = h("tbody");
  const draw = () => {
    body.replaceChildren(...rows.map((e, i) => h("tr", {},
      h("td", {}, h("input", { type: "text", value: e.match, oninput: (ev) => { e.match = ev.target.value; } })),
      h("td", {}, (() => {
        const sel = h("select", { onchange: (ev) => { e.kind = ev.target.value; draw(); } },
          h("option", { value: "es" }, "Spanish IPA"), h("option", { value: "en" }, "English IPA"), h("option", { value: "say" }, "Say instead"));
        sel.value = e.say != null && e.kind !== "es" && e.kind !== "en" ? "say" : (e.kind || e.lang || "es");
        e.kind = sel.value;
        return sel;
      })()),
      h("td", {}, h("input", { type: "text", value: e.kind === "say" ? (e.say || "") : (e.ipa || ""),
        oninput: (ev) => { if (e.kind === "say") e.say = ev.target.value; else e.ipa = ev.target.value; } })),
      h("td", {}, h("input", { type: "text", value: e.note || "", oninput: (ev) => { e.note = ev.target.value; } })),
      h("td", {}, h("button", { onclick: () => { rows.splice(i, 1); draw(); } }, "✕")))));
  };
  draw();
  const log = h("pre", { class: "log", hidden: true });
  const save = async () => {
    const entries = rows.map((e) => e.kind === "say"
      ? { match: e.match, say: e.say, ...(e.note ? { note: e.note } : {}) }
      : { match: e.match, lang: e.kind, ipa: e.ipa, ...(e.note ? { note: e.note } : {}) });
    log.hidden = false;
    try {
      S = await api("POST", "/api/dict", { entries });
      log.textContent = "Saved. Clips that use a changed entry now differ from their audio: use “Regenerate changed clips”.";
    } catch (e) { log.textContent = "Error: " + e.message; }
  };
  $("#detail").replaceChildren(h("div", { class: "card" },
    h("h3", {}, "Pronunciation dictionary"),
    h("p", { class: "muted" }, "Fixes a spelling everywhere it appears in any script, e.g. “-ción”. Matches whole fragments only, never inside a longer word. Saved to pronunciations.json."),
    h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Written"), h("th", {}, "Kind"), h("th", {}, "Sound / words"), h("th", {}, "Note"), h("th"))), body),
    h("div", { class: "row" },
      h("button", { onclick: () => { rows.push({ match: "", kind: "es", ipa: "" }); draw(); } }, "+ Add entry"),
      h("button", { class: "primary", onclick: save }, "Save dictionary")),
    log,
    h("details", { style: "margin-top:.75rem" }, h("summary", {}, "Spanish IPA cheat sheet"),
      h("p", { class: "muted" },
        "Vowels: a e i o u · ", h("code", {}, "ɾ"), " single-tap r (pero) · ", h("code", {}, "r"), " rolled r (perro) · ",
        h("code", {}, "x"), " j as in jamón · ", h("code", {}, "ɲ"), " ñ · ", h("code", {}, "β ð ɣ"), " soft b, d, g between vowels · ",
        "Mexican Spanish: c/z before e, i = ", h("code", {}, "s"), ". Mark stress with ", h("code", {}, "ˈ"), " before the syllable: ",
        h("code", {}, "naˈsjon"), "."))));
}

// ── Wiring ──
$("#filter").addEventListener("change", renderList);
$("#btn-dict").addEventListener("click", () => select("__dict"));
$("#btn-regen-all").addEventListener("click", async (ev) => {
  if (!S.hasKey) { alert("Start the tool with: node --env-file=.env review.mjs"); return; }
  ev.target.disabled = true; ev.target.textContent = "Regenerating…";
  try {
    const r = await api("POST", "/api/generate", {});
    S = r.state; audioVersion = Date.now();
    alert(r.output.split("\n").slice(-1)[0] || "Done");
    select(current || S.items[0].id);
  } catch (e) { alert(e.message); }
  ev.target.disabled = false; ev.target.textContent = "Regenerate changed clips";
});

(async () => {
  S = await api("GET", "/api/state");
  const want = decodeURIComponent(location.hash.slice(1));
  select(S.items.some((i) => i.id === want) || want === "__dict" ? want : S.items[0].id);
})();
</script>
</body>
</html>`;
