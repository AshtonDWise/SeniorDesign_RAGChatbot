import React, { useState, useRef } from "react";
import ChatMessage from "./ChatMessage";
import { chat } from "./api";

type Msg = { role: "user" | "bot"; text: string; citations?: string[]; ephemeral?: boolean };

export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "Ask a question about the PDFs. Answers will cite source chunks." }
  ]);
  const [input, setInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function send() {
    const q = input.trim();
    if (!q) return;

    // user message
    setMsgs(m => [...m, { role: "user", text: q }]);
    setInput("");

    // staged status messages
    const id = crypto.randomUUID();
    setMsgs(m => [...m, { role: "bot", text: "Searching", ephemeral: true }]);
    // after 900ms, switch to Generating unless response already arrived
    const t1 = setTimeout(() => {
      setMsgs(m => {
        const i = m.findIndex(mm => mm.ephemeral);
        if (i === -1) return m;
        const copy = m.slice();
        copy[i] = { ...copy[i], text: "Generating", ephemeral: true };
        return copy;
      });
    }, 900);

    try {
      const res = await chat(q);
      clearTimeout(t1);
      // remove ephemeral
      setMsgs(m => m.filter(mm => !mm.ephemeral));
      // final bot message
      setMsgs(m => [...m, { role: "bot", text: res.answer, citations: res.citations }]);
    } catch (e: any) {
      clearTimeout(t1);
      setMsgs(m => m.filter(mm => !mm.ephemeral));
      setMsgs(m => [...m, { role: "bot", text: `Error: ${String(e)}` }]);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white shadow p-4">
        <h1 className="text-2xl font-bold">OSP & PSFS Chatbot</h1>
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
