import "dotenv/config";
import express from "express";
import cors from "cors";
import { answer, ingestAllPdfs, getIndexStats, retrieve } from "./rag.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(",") || "*" }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/chat", async (req, res) => {
  const q = String(req.body?.message || "").trim();
  if (!q) return res.status(400).json({ error: "empty message" });
  try {
    const out = await answer(q);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// optional debug endpoints
app.get("/debug/index", async (_req, res) => {
  await ingestAllPdfs();
  res.json(getIndexStats());
});
app.post("/debug/retrieve", async (req, res) => {
  const q = String(req.body?.q || "");
  const hits = await retrieve(q, 8);
  res.json(hits.map(h => ({ doc: h.doc, chunk: h.chunk_id, score: Number(h.score.toFixed(4)), preview: h.text.slice(0, 200) })));
});

const PORT = Number(process.env.PORT || 8000);

// build or load index on boot
await ingestAllPdfs();

app.listen(PORT, () => console.log(`server on ${PORT}`));
