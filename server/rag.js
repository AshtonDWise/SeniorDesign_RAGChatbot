import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

// ---------- paths ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DATA_DIR = path.join(__dirname, "data");
const INDEX_DIR = path.join(__dirname, "index");
const META_PATH = path.join(INDEX_DIR, "meta.json");
const EMB_PATH = path.join(INDEX_DIR, "embeddings.bin");
const SHAPE_PATH = path.join(INDEX_DIR, "shape.json");

// ---------- PDF -> text via pdfjs-dist ----------
async function pdfToText(filePath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Do NOT set GlobalWorkerOptions.workerSrc here.
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({
    data,
    disableWorker: true,          // <<< key fix for Node
    useWorkerFetch: false,
    isEvalSupported: false
  }).promise;

  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    out.push(tc.items.map(it => it.str).join(" "));
  }
  try { await doc.destroy(); } catch {}
  return out.join("\n");
}

// ---------- embeddings via @xenova/transformers ----------
let embedder = null;
async function getEmbedder() {
  if (!embedder) {
    const { pipeline } = await import("@xenova/transformers");
    const model = process.env.EMB_MODEL || "Xenova/bge-base-en-v1.5"; // stronger than -small
    embedder = await pipeline("feature-extraction", model, { quantized: true });
  }
  return embedder;
}

async function embed(texts) {
  const e = await getEmbedder();
  const out = await e(texts, { pooling: "mean", normalize: true });
  const flat = Array.isArray(out.data) ? Float32Array.from(out.data) : out.data; // Float32Array
  const dim = flat.length / texts.length;
  const arrs = [];
  for (let i = 0; i < texts.length; i++) arrs.push(flat.slice(i * dim, (i + 1) * dim));
  return { vectors: arrs, dim };
}

function cosine(a, b) {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return s / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

function chunkText(text, size = 1200, overlap = 150) {
  const out = [];
  for (let i = 0; i < text.length; i += size - overlap) {
    const c = text.slice(i, i + size).trim();
    if (c) out.push(c);
  }
  return out;
}

// ---------- in-process persistent index ----------
let META = [];   // [{doc, path, chunk_id, text}]
let EMB = null;  // Float32Array length META.length * D
let D = 0;

function loadIndexIfExists() {
  try {
    if (!fs.existsSync(META_PATH) || !fs.existsSync(EMB_PATH) || !fs.existsSync(SHAPE_PATH)) return false;
    META = JSON.parse(fs.readFileSync(META_PATH, "utf-8"));
    const { n, d } = JSON.parse(fs.readFileSync(SHAPE_PATH, "utf-8"));
    const buf = fs.readFileSync(EMB_PATH);
    EMB = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    D = d;
    return META.length === n && EMB.length === n * d;
  } catch {
    return false;
  }
}

function saveIndex() {
  fs.mkdirSync(INDEX_DIR, { recursive: true });
  fs.writeFileSync(META_PATH, JSON.stringify(META));
  fs.writeFileSync(EMB_PATH, Buffer.from(EMB.buffer));
  fs.writeFileSync(SHAPE_PATH, JSON.stringify({ n: META.length, d: D }));
}

export function getIndexStats() {
  return { docs: new Set(META.map(m => m.doc)).size, chunks: META.length, dim: D };
}

// ---------- ingest PDFs ----------
export async function ingestAllPdfs() {
  if (loadIndexIfExists()) return;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pdfs = fs.readdirSync(DATA_DIR).filter(f => f.toLowerCase().endsWith(".pdf"));
  const rows = [];
  for (const f of pdfs) {
    const p = path.join(DATA_DIR, f);
    const text = await pdfToText(p);
    console.log(`[ingest] ${f} chars=${text.length}`);
    const chunks = chunkText(text || "");
    console.log(`[ingest] ${f} chunks=${chunks.length}`);
    chunks.forEach((t, ci) => rows.push({ doc: f, path: p, chunk_id: ci, text: t }));
  }
  console.log(`[ingest] total docs=${pdfs.length}, total chunks=${rows.length}`);

  if (rows.length === 0) {
    META = [];
    EMB = new Float32Array(0);
    D = 0;
    saveIndex();
    return;
  }

  const { vectors, dim } = await embed(rows.map(r => r.text));
  D = dim;
  META = rows;
  EMB = new Float32Array(vectors.length * D);
  for (let i = 0; i < vectors.length; i++) EMB.set(vectors[i], i * D);
  saveIndex();
}

function ensureIndexLoaded() {
  if (META.length && EMB && D) return true;
  return loadIndexIfExists();
}

export async function retrieve(query, k = 12) {
  if (!ensureIndexLoaded()) return [];
  const { vectors } = await embed([query]);
  const q = vectors[0];
  const scored = [];
  for (let i = 0; i < META.length; i++) {
    const v = EMB.subarray(i * D, (i + 1) * D);
    scored.push({ i, score: cosine(q, v) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => ({ ...META[s.i], score: s.score }));
}

// ---------- generation via OpenAI-compatible HF endpoint ----------
export async function generateWithExternalModel(prompt) {
  const base = process.env.HF_URL;   // e.g. https://...huggingface.cloud
  const token = process.env.HF_TOKEN;
  const model = process.env.HF_MODEL || "LiquidAI/LFM2-1.2B-RAG-GGUF";
  if (!base || !token) return "No generator configured";

  const url = base.replace(/\/+$/, "") + "/v1/chat/completions";
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
  const body = {
    model,
    messages: [
      { role: "system", content: "Use only the provided context if present. If information is missing, say you do not know." },
      { role: "user", content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 512
  };

  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const raw = await r.text();
  if (!r.ok) return `Generator error ${r.status}: ${raw}`;

  try {
    const js = JSON.parse(raw);
    const content = js?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : raw;
  } catch {
    return raw;
  }
}

// ---------- RAG answer ----------
export async function answer(query) {
  await ingestAllPdfs();

  const q = String(query || "").trim();
  const wordCount = q.split(/\s+/).filter(Boolean).length;
  const shortGreeting = /^(hi|hello|hey|yo|hiya|sup|good (morning|afternoon|evening))\b/i.test(q) && wordCount <= 3;

  const hits = await retrieve(q, 12);
  const best = hits[0]?.score ?? 0;

  // Only bypass if it's a *short* greeting. Otherwise try RAG.
  if (shortGreeting || best < 0.2) {
    const text = await generateWithExternalModel(`User: ${q}\nAnswer naturally.`);
    return { answer: text, citations: [] };
  }

  const context = hits.map(h => `[${h.doc}#chunk${h.chunk_id}]\n${h.text}`).join("\n\n");

  const prompt =
    "You are a retrieval-grounded assistant. Use ONLY the provided context. If the answer is not in the context, say you do not know.\n" +
    "Always include citations as doc#chunk ids found in the context.\n\n" +
    `Question: ${q}\n\n---CONTEXT START---\n${context}\n---CONTEXT END---\n\nAnswer:`;

  const text = await generateWithExternalModel(prompt);
  const citations = hits.slice(0, 4).map(h => `${h.doc}#chunk${h.chunk_id}`);
  return { answer: text, citations };
}