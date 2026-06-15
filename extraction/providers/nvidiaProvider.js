import { connect } from "node:http2";

const defaultNvidiaEndpoint = "https://integrate.api.nvidia.com/v1/chat/completions";
const defaultNvidiaModel = "deepseek-ai/deepseek-v4-flash";

export async function nvidiaProvider({ prompt, schemaVersion, config = {} }) {
  const apiKey = config.apiKey ?? process.env.NVIDIA_API_KEY;
  const endpoint = config.endpoint ?? process.env.NVIDIA_API_URL ?? defaultNvidiaEndpoint;
  const model = config.model ?? process.env.NVIDIA_MODEL ?? defaultNvidiaModel;

  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not configured.");
  }

  const response = await postChatCompletion({ endpoint, apiKey, model, prompt });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`NVIDIA API failed with ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("NVIDIA API response did not include message content.");
  }

  return stampProviderMetadata(content, {
    model,
    schemaVersion,
  });
}

async function postChatCompletion({ endpoint, apiKey, model, prompt }) {
  const payload = {
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
    max_tokens: 6000,
  };

  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error.cause?.code === "UND_ERR_SOCKET") {
      return await postChatCompletionHttp2({ endpoint, apiKey, payload });
    }

    const cause = error.cause ? ` Cause: ${error.cause.code || error.cause.message}` : "";
    throw new Error(`NVIDIA API network request failed: ${error.message}.${cause}`);
  }
}

async function postChatCompletionHttp2({ endpoint, apiKey, payload }) {
  const url = new URL(endpoint);
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const client = connect(url.origin);
    const chunks = [];

    client.on("error", reject);

    const request = client.request({
      ":method": "POST",
      ":path": `${url.pathname}${url.search}`,
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });

    let status = 0;

    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      client.close();
      const responseText = Buffer.concat(chunks).toString("utf8");
      resolve({
        ok: status >= 200 && status < 300,
        status,
        text: async () => responseText,
        json: async () => JSON.parse(responseText),
      });
    });

    request.on("error", (error) => {
      client.close();
      reject(new Error(`NVIDIA API HTTP/2 request failed: ${error.message}`));
    });

    request.end(body);
  });
}

function stampProviderMetadata(content, metadata) {
  const parsed = JSON.parse(stripJsonCodeFence(content));

  return {
    ...parsed,
    schemaVersion: parsed.schemaVersion || metadata.schemaVersion,
    extractionMode: parsed.extractionMode || `nvidia:${metadata.model}`,
  };
}

function stripJsonCodeFence(value) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}
