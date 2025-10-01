import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { VectorStoreIndex } from "vectra";
import fetch from "node-fetch";

// initialize local vector index
const dataDir = path.join(process.cwd(), "data");
const indexFile = path.join(process.cwd(), "vector.index.json");
let index = new VectorStoreIndex();

// ------------------- PDF INGEST -------------------
export async function ingestAllPdfs() {
  console.log("Ingesting PDFs from", dataDir);
  const files = fs.readdirSync(dataDir).filter(f => f.toLowerCase().endsWith(".pdf"));
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 150 });

  for (const file of files) {
    const fullPath = path.join(dataDir, file);
    const buf = fs.readFileSync(fullPath);
    const data = await pdfParse(buf);
    const chunks = await splitter.splitText(data.text);
    for (const text of chunks) {
      index.addDocument({ text, meta: { source: file } });
    }
  }

  console.log(`Indexed ${index.documents.length} text chunks from ${files.length} PDFs`);
  fs.writeFileSync(indexFile, JSON.stringify(index));
  return true;
}

// ------------------- QUERY HANDLER -------------------
export async function answer(query) {
  if (!index.documents.length && fs.existsSync(indexFile)) {
    index = VectorStoreIndex.fromJSON(JSON.parse(fs.readFileSync(indexFile, "utf8")));
  }

  if (!index.documents.length) return { answer: "No data indexed.", citations: [] };

  const matches = index.similaritySearch(query, 4);
  const context = matches.map(m => m.text).join("\n\n");
  const citations = matches.map(m => m.meta.source);

  const prompt = `
You are a document retrieval assistant. Use only the context below to answer the question.

Context:
${context}

Question: ${query}
`;

  const answerText = await generateWithExternalModel(prompt);
  return { answer: answerText, citations };
}

// ------------------- GENERATION HANDLER -------------------
export async function generateWithExternalModel(prompt) {
  const hfUrl = process.env.HF_URL;
  const hfToken = process.env.HF_TOKEN;
  const llamaUrl = process.env.LLAMA_URL;
  const ollamaUrl = process.env.OLLAMA_URL;
  const ollamaModel = process.env.OLLAMA_MODEL || "lfm2-1-2b-rag";

  // helper for readable errors
  const parseOut = raw => {
    try {
      const js = JSON.parse(raw);
      if (Array.isArray(js) && js[0]?.generated_text) return js[0].generated_text;
      if (typeof js.generated_text === "string") return js.generated_text;
      if (typeof js.outputs === "string") return js.outputs;
      if (Array.isArray(js.outputs) && typeof js.outputs[0] === "string") return js.outputs[0];
      if (typeof js.output_text === "string") return js.output_text;
      if (typeof js.error === "string") return `Generator error: ${js.error}`;
      return JSON.stringify(js);
    } catch {
      return raw;
    }
  };

  // ---- Hugging Face ----
  if (hfUrl && hfToken) {
    const body = {
      inputs: prompt,
      parameters: {
        max_new_tokens: 512,
        temperature: 0.2,
        top_p: 0.95,
        return_full_text: false
      }
    };

    const r = await fetch(hfUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${hfToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const raw = await r.text();
    if (!r.ok) return `Generator error ${r.status}: ${parseOut(raw)}`;
    return parseOut(raw);
  }

  // ---- llama.cpp ----
  if (llamaUrl) {
    const r = await fetch(llamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, n_predict: 512, temperature: 0.2 })
    });
    const raw = await r.text();
    try { return JSON.parse(raw).content || raw; } catch { return raw; }
  }

  // ---- Ollama ----
  if (ollamaUrl) {
    const r = await fetch(ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ollamaModel, prompt, options: { temperature: 0.2 } })
    });
    const raw = await r.text();
    try { return JSON.parse(raw).response || raw; } catch { return raw; }
  }

  return "No generator configured";
}
