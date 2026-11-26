// Accuracy on 30 hand-labelled complaints (data/labelled-complaints.json). Run: npm run eval
// Compares the keyword fallback with the configured LLM. Writes data/accuracy.json for the dashboard.
import "../src/env.js";
import fs from "node:fs";
import { classify, keywordClassify } from "../src/classify.js";
import { llmKind } from "../src/ai.js";

const set = JSON.parse(fs.readFileSync(new URL("../data/labelled-complaints.json", import.meta.url), "utf8"));
const score = (preds) => {
  const n = set.length, hit = (f) => Math.round((100 * set.filter((x, i) => f(x, preds[i])).length) / n);
  return {
    category: hit((x, p) => p.category === x.category),
    location: hit((x, p) => p.building === x.building && String(p.room) === x.room),
    safety: hit((x, p) => !!p.is_safety_hazard === x.safety),
    missedHazards: set.filter((x, i) => x.safety && !preds[i].is_safety_hazard).length,
  };
};

const out = { n: set.length, at: new Date().toISOString(), keywords: score(set.map((x) => keywordClassify(x.text))) };
if (llmKind()) {
  const preds = [];
  for (const x of set) {
    preds.push(await classify(x.text));
    await new Promise((r) => setTimeout(r, 4000)); // ponytail: fixed gap for free-tier rate limits (~15/min); drop it on a paid key
  }
  out.llm = { model: process.env.BEDROCK_MODEL_ID || process.env.LLM_MODEL, fellBack: preds.filter((p) => p.source === "keywords").length, ...score(preds) };
}
fs.writeFileSync(new URL("../data/accuracy.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
