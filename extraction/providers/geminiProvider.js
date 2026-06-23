const defaultEndpoint = "https://generativelanguage.googleapis.com/v1beta";

export async function geminiProvider({ prompt, schemaVersion, config = {} }) {
  const apiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
  const model = config.model ?? process.env.GEMINI_MODEL;
  const endpoint = config.endpoint ?? process.env.GEMINI_API_URL ?? defaultEndpoint;
  const timeoutMs = config.timeoutMs ?? Number(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? 45_000);
  const maxTokens = config.maxTokens ?? 2_000;

  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  if (!model) throw new Error("GEMINI_MODEL is not configured.");

  let response;
  try {
    response = await fetch(`${endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Return strict JSON only. Follow the requested schema and do not invent report evidence." }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw timeoutError("Gemini", error, timeoutMs);
  }

  if (!response.ok) throw new Error(`Gemini API failed with ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json();
  const content = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!content) throw new Error("Gemini API response did not include message content.");
  return stamp(content, schemaVersion, model);
}

function stamp(content, schemaVersion, model) {
  const parsed = JSON.parse(stripJsonCodeFence(content));
  return { ...parsed, schemaVersion: parsed.schemaVersion || schemaVersion, extractionMode: parsed.extractionMode || `gemini:${model}` };
}

function timeoutError(name, error, timeoutMs) {
  if (error.name === "TimeoutError" || error.name === "AbortError") return new Error(`${name} API request timed out after ${timeoutMs}ms.`);
  return error;
}

function stripJsonCodeFence(value) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
