import React from "react";

export default function ChatMessage({
  role,
  text,
  citations,
}: {
  role: "user" | "bot";
  text: string;
  citations?: string[];
}) {
  return (
    <div className={`my-3 ${role === "user" ? "text-right" : ""}`}>
      <div
        className={`inline-block max-w-[75%] rounded-lg px-4 py-2 shadow ${
          role === "user" ? "bg-blue-600 text-white" : "bg-white"
        }`}
      >
        <div className="whitespace-pre-wrap">{text}</div>
        {role === "bot" && citations && citations.length > 0 && (
          <div className="text-xs mt-2 opacity-70">
            Sources: {citations.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
