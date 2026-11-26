// LLM provider: Amazon Bedrock (Converse API, Bedrock API key) or any OpenAI-compatible API.
// Plain fetch, no SDKs. Returns null when nothing is configured so callers fall back.
const env = process.env;
const bedrock = () => env.AWS_BEARER_TOKEN_BEDROCK && env.BEDROCK_MODEL_ID;
const openai = () => env.LLM_API_KEY && env.LLM_BASE_URL && env.LLM_MODEL;
const region = () => env.AWS_REGION || "us-east-1";

export const llmKind = () => (bedrock() ? "bedrock" : openai() ? "openai-compatible" : null);

const firstJson = (s) => JSON.parse(String(s).match(/\{[\s\S]*\}/)?.[0] ?? "null");

// images: [{ mime: "image/jpeg", base64: "..." }]
export async function chatJson(system, text, images = []) {
  if (bedrock()) {
    const content = [
      ...images.map((i) => ({ image: { format: i.mime.split("/")[1].replace("jpg", "jpeg"), source: { bytes: i.base64 } } })),
      { text },
    ];
    const res = await fetch(
      `https://bedrock-runtime.${region()}.amazonaws.com/model/${encodeURIComponent(env.BEDROCK_MODEL_ID)}/converse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}` },
        body: JSON.stringify({
          system: [{ text: system }],
          messages: [{ role: "user", content }],
          inferenceConfig: { maxTokens: 600, temperature: 0 },
        }),
      }
    );
    if (!res.ok) throw new Error(`Bedrock ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return firstJson(data.output.message.content.map((c) => c.text ?? "").join(""));
  }
  if (openai()) {
    const content = images.length
      ? [{ type: "text", text }, ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.base64}` } }))]
      : text;
    const post = () => fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content }],
      }),
    });
    let res = await post();
    // Free tiers return 503/429 under load; one retry usually gets through.
    if (res.status === 503 || res.status === 429) res = await new Promise((r) => setTimeout(r, 1500)).then(post);
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return firstJson(data.choices[0].message.content);
  }
  return null;
}

// Text embedding for duplicate detection. Bedrock Titan V2, or OpenAI-compatible if EMBEDDING_MODEL is set.
export async function embed(text) {
  try {
    if (env.AWS_BEARER_TOKEN_BEDROCK) {
      const model = env.BEDROCK_EMBED_MODEL_ID || "amazon.titan-embed-text-v2:0";
      const res = await fetch(`https://bedrock-runtime.${region()}.amazonaws.com/model/${encodeURIComponent(model)}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}` },
        body: JSON.stringify({ inputText: text, dimensions: 512, normalize: true }),
      });
      if (!res.ok) throw new Error(`Titan ${res.status}`);
      return (await res.json()).embedding;
    }
    if (env.LLM_API_KEY && env.EMBEDDING_MODEL) {
      const res = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` },
        body: JSON.stringify({ model: env.EMBEDDING_MODEL, input: text }),
      });
      if (!res.ok) throw new Error(`Embeddings ${res.status}`);
      return (await res.json()).data[0].embedding;
    }
  } catch (err) {
    console.error("[embed] failed, using rule-based dedup only:", err.message);
  }
  return null;
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) (dot += a[i] * b[i]), (na += a[i] * a[i]), (nb += b[i] * b[i]);
  return dot / (Math.sqrt(na * nb) || 1);
}
