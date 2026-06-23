const defaultDeepseekEndpoint = "https://api.deepseek.com/chat/completions";
const defaultDeepseekModel = "deepseek-v4-flash";
const defaultRequestTimeoutMs = 45_000;

export async function deepseekProvider({ prompt, schemaVersion, config = {} }) {
  const apiKey = config.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const endpoint = config.endpoint ?? process.env.DEEPSEEK_API_URL ?? defaultDeepseekEndpoint;
  const model = config.model ?? process.env.DEEPSEEK_MODEL ?? defaultDeepseekModel;
  const timeoutMs = config.timeoutMs ?? Number(process.env.DEEPSEEK_REQUEST_TIMEOUT_MS ?? process.env.AI_REQUEST_TIMEOUT_MS ?? defaultRequestTimeoutMs);
  const maxTokens = config.maxTokens ?? 4_000;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured.");
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You extract SLL readiness evidence from ESG reports. Return strict JSON only and follow the requested schema.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`DeepSeek API request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek API failed with ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("DeepSeek API response did not include message content.");
  }

  return stampProviderMetadata(content, {
    model,
    schemaVersion,
  });
}

function stampProviderMetadata(content, metadata) {
  const parsed = JSON.parse(stripJsonCodeFence(content));

  return {
    ...parsed,
    schemaVersion: parsed.schemaVersion || metadata.schemaVersion,
    extractionMode: parsed.extractionMode || `deepseek:${metadata.model}`,
  };
}

function stripJsonCodeFence(value) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}
