const defaultEndpoint = "https://api.groq.com/openai/v1/chat/completions";

export async function groqProvider({ prompt, schemaVersion, config = {} }) {
  const apiKey = config.apiKey ?? process.env.GROQ_API_KEY;
  const model = config.model ?? process.env.GROQ_MODEL;
  const endpoint = config.endpoint ?? process.env.GROQ_API_URL ?? defaultEndpoint;
  const timeoutMs = config.timeoutMs ?? Number(process.env.GROQ_REQUEST_TIMEOUT_MS ?? 45_000);
  const maxTokens = config.maxTokens ?? 2_000;

  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");
  if (!model) throw new Error("GROQ_MODEL is not configured.");

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Return strict JSON only. Follow the requested schema and do not invent report evidence." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error(`Groq API request timed out after ${timeoutMs}ms.`);
    throw error;
  }

  if (!response.ok) throw new Error(`Groq API failed with ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const content = (await response.json())?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq API response did not include message content.");
  const parsed = JSON.parse(stripJsonCodeFence(content));
  return { ...parsed, schemaVersion: parsed.schemaVersion || schemaVersion, extractionMode: parsed.extractionMode || `groq:${model}` };
}

function stripJsonCodeFence(value) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
