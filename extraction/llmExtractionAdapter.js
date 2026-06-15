import { extractSllReadinessJson } from "./sllExtractionAdapter.js";
import {
  buildSllExtractionPrompt,
  sllExtractionSchemaVersion,
  validateSllExtractionContract,
} from "./sllExtractionSchema.js";

export async function extractSllReadinessWithLlm({ text, metadata, provider = mockLlmProvider }) {
  const prompt = buildSllExtractionPrompt({ text, metadata });
  const response = await provider({
    prompt,
    text,
    metadata,
    schemaVersion: sllExtractionSchemaVersion,
  });

  const extraction = normalizeLlmExtractionResponse(response);
  const validation = validateSllExtractionContract(extraction);

  return {
    ok: validation.ok,
    extraction,
    validation,
    prompt,
  };
}

export async function mockLlmProvider({ text, metadata }) {
  const extraction = extractSllReadinessJson({ text, metadata });

  return {
    ...extraction,
    schemaVersion: sllExtractionSchemaVersion,
    extractionMode: "mock-llm-provider",
    confidence: {
      overall: extraction.confidence.overall,
      notes: [
        "Mock LLM provider reuses the rule adapter so downstream scoring can be tested before an API is connected.",
        "Replace this provider with DeepSeek, OpenAI or Anthropic for production extraction.",
      ],
    },
  };
}

export function normalizeLlmExtractionResponse(response) {
  if (typeof response === "string") {
    return JSON.parse(stripJsonCodeFence(response));
  }

  return response;
}

function stripJsonCodeFence(value) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}
