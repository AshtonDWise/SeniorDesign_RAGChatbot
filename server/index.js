import "dotenv/config";
import express from "express";
import cors from "cors";
import { answer, ingestAllPdfs } from "./rag.js";

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

const PORT = Number(process.env.PORT || 8000);

// warm the index at boot so data/ PDFs are ready
await ingestAllPdfs();

app.listen(PORT, () => console.log(`server on ${PORT}`));
