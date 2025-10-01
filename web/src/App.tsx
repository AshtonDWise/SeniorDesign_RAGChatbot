import React, { useState } from "react";
import ChatMessage from "./ChatMessage";
import { chat } from "./api";

type Msg = { role: "user" | "bot"; text: string; citations?: string[] };

export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "Ask a question about the PDFs. Answers will cite source chunks." },
  ]);
  const [input, setInput] = useState("");

  async function send() {
    const q = input.trim();
    if (!q) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    const res = await chat(q);
    setMsgs((m) => [...m, { role: "bot", text: res.answer, citations: res.citations }]);
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white shadow p-4">
        <h1 className="text-2xl font-bold">PDF RAG Chatbot</h1>
        <p className="text-sm text-gray-600">Answers come only from the PDFs in the backend data folder.</p>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto">
          {msgs.map((m, i) => (
            <ChatMessage key={i} {...m} />
          ))}
        </div>
      </main>

      <footer className="bg-white p-4 border-t">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about your PDFs..."
            className="flex-1 border rounded-lg p-3"
          />
          <button onClick={send} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
