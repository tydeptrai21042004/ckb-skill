const MAX_RESEARCH_INPUT_CHARS = 20_000;

function words(text) { return text.trim().split(/\s+/).filter(Boolean); }
function sentences(text) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((v) => v.trim()).filter(Boolean);
}

export function validateResearchInput(input) {
  if (typeof input !== "string") throw new TypeError("research input must be a string");
  if (!input.trim()) throw new Error("research input must not be empty");
  if (input.length > MAX_RESEARCH_INPUT_CHARS) throw new Error(`research input exceeds ${MAX_RESEARCH_INPUT_CHARS} characters`);
  return input;
}

export function analyzeResearchText(input) {
  validateResearchInput(input);
  const ws = words(input);
  const ss = sentences(input);
  const paragraphs = input.split(/\n\s*\n/).map((v) => v.trim()).filter(Boolean);
  const lower = input.toLowerCase();
  const sectionSignals = {
    introduction: /\b(introduction|background|motivation)\b/i.test(input),
    method: /\b(method|methods|methodology|approach|algorithm)\b/i.test(input),
    results: /\b(result|results|experiment|experiments|evaluation)\b/i.test(input),
    discussion: /\b(discussion|analysis)\b/i.test(input),
    conclusion: /\b(conclusion|conclusions)\b/i.test(input),
    limitations: /\b(limitation|limitations|threats to validity)\b/i.test(input),
  };
  const unique = new Set(ws.map((w) => w.toLowerCase().replace(/[^a-z0-9-]/g, "")).filter(Boolean));
  const longSentences = ss.filter((s) => words(s).length >= 35).length;
  const citationLike = (input.match(/\[[0-9]+(?:\s*[-,]\s*[0-9]+)*\]|\([A-Z][A-Za-z-]+(?:\s+et\s+al\.)?,?\s+(?:19|20)\d{2}[a-z]?\)/g) || []).length;
  const equationLike = (input.match(/\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\begin\{(?:equation|align)\*?\}/g) || []).length;
  const transitionMarkers = ["however", "therefore", "moreover", "consequently", "in contrast", "in addition"];
  const transitions = Object.fromEntries(transitionMarkers.map((m) => [m, lower.split(m).length - 1]));
  const completeness = Math.round((Object.values(sectionSignals).filter(Boolean).length / Object.keys(sectionSignals).length) * 100);
  return Object.freeze({
    service: "research-insights-v1",
    words: ws.length,
    sentences: ss.length,
    paragraphs: paragraphs.length,
    estimatedReadingMinutes: Math.max(1, Math.ceil(ws.length / 220)),
    averageSentenceWords: ss.length ? Number((ws.length / ss.length).toFixed(1)) : 0,
    longSentenceRatio: ss.length ? Number((longSentences / ss.length).toFixed(3)) : 0,
    lexicalDiversity: ws.length ? Number((unique.size / ws.length).toFixed(4)) : 0,
    citationLikeCount: citationLike,
    equationLikeCount: equationLike,
    sectionSignals,
    structureCoveragePercent: completeness,
    transitionMarkers: transitions,
    note: "Structure coverage is a heuristic completeness signal, not a scientific-quality score.",
  });
}

export { MAX_RESEARCH_INPUT_CHARS };
