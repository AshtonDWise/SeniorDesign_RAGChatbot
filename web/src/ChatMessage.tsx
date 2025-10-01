import React from "react";

export default function ChatMessage({
  role,
  text,
  citations,
  ephemeral
}: {
  role: "user" | "bot";
  text: string;
  citations?: string[];
  ephemeral?: boolean;
}) {
  const bubble =
    role === "user"
      ? "bg-blue-600 text-white"
      : "bg-white";

  // subtle animated dots when ephemeral
  const content = ephemeral ? (
    <span className="inline-flex items-center gap-1">
      {text}
      <span className="loading-dots">
        <span>.</span><span>.</span><span>.</span>
      </span>
    </span>
  ) : (
    text
  );

  return (
    <div className={`my-3 ${role === "user" ? "text-right" : ""}`}>
      <div className={`inline-block max-w-[75%] rounded-lg px-4 py-2 shadow ${bubble}`}>
        <div className="whitespace-pre-wrap">{content}</div>
        {role === "bot" && citations && citations.length > 0 && !ephemeral && (
          <div className="text-xs mt-2 opacity-70">Sources: {citations.join(", ")}</div>
        )}
      </div>
    </div>
  );
}
