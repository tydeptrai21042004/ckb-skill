const MAX_INPUT_CHARS = 20_000;

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function sentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function analyzePaper(input) {
  if (typeof input !== "string") throw new TypeError("paper input must be a string");
  if (input.length === 0) throw new Error("paper input must not be empty");
  if (input.length > MAX_INPUT_CHARS) throw new Error(`paper input exceeds ${MAX_INPUT_CHARS} characters`);

  const ws = words(input);
  const ss = sentences(input);
  const lower = input.toLowerCase();
  const markers = ["however", "therefore", "because", "limitation", "result", "method", "conclusion"];
  const markerHits = Object.fromEntries(markers.map((m) => [m, lower.split(m).length - 1]));

  return Object.freeze({
    service: "paper-analyzer-v1",
    characters: input.length,
    words: ws.length,
    sentences: ss.length,
    lexicalDiversity: ws.length ? Number((new Set(ws.map((w) => w.toLowerCase().replace(/[^a-z0-9-]/g, ""))).size / ws.length).toFixed(4)) : 0,
    markerHits,
    preview: ss.slice(0, 2).join(" ").slice(0, 500),
  });
}

export { MAX_INPUT_CHARS };
