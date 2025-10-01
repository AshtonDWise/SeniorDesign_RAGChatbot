export async function chat(message: string) {
  const r = await fetch(import.meta.env.VITE_API_URL + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return await r.json(); // {answer, citations}
}
