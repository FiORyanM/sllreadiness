import { extractSllReadinessJson } from "./sllExtractionAdapter.js";
import {
  buildSllExtractionPrompt,
  sllExtractionSchemaVersion,
  validateSllExtractionContract,
} from "./sllExtractionSchema.js";

const defaultDealDefaults = {
  loanSizeM: 500,
  tenor: 5,
  baseMargin: 150,
  ratchetBest: 10,
  ratchetWorst: 5,
};

const componentLabels = {
  kpiDataHistory: "KPI data history",
  kpiMethodology: "KPI methodology",
  reportingInfrastructure: "Reporting infrastructure",
  externalVerification: "External verification",
  strategicAlignment: "Strategic alignment",
};

export async function extractSllReadinessWithLlm({ text, metadata, provider = mockLlmProvider }) {
  const prompt = buildSllExtractionPrompt({ text, metadata });
  const response = await provider({
    prompt,
    text,
    metadata,
    schemaVersion: sllExtractionSchemaVersion,
  });

  const extraction = applyExtractionDefaults(normalizeLlmExtractionResponse(response));
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

function applyExtractionDefaults(extraction) {
  const dealDefaults = {
    loanSizeM: positiveNumberOrDefault(extraction?.dealDefaults?.loanSizeM, defaultDealDefaults.loanSizeM),
    tenor: positiveNumberOrDefault(extraction?.dealDefaults?.tenor, defaultDealDefaults.tenor),
    baseMargin: positiveNumberOrDefault(extraction?.dealDefaults?.baseMargin, defaultDealDefaults.baseMargin),
    ratchetBest: nonNegativeNumberOrDefault(extraction?.dealDefaults?.ratchetBest, defaultDealDefaults.ratchetBest),
    ratchetWorst: nonNegativeNumberOrDefault(extraction?.dealDefaults?.ratchetWorst, defaultDealDefaults.ratchetWorst),
  };

  return {
    ...extraction,
    dealDefaults,
    modelInputs: {
      ...extraction.modelInputs,
      componentsByKey: normalizeComponents(extraction.modelInputs?.componentsByKey ?? {}),
    },
  };
}

function normalizeComponents(componentsByKey) {
  return Object.fromEntries(
    Object.entries(componentsByKey).map(([key, component]) => [
      key,
      {
        ...component,
        name: componentLabels[key] ?? component.name,
      },
    ]),
  );
}

function positiveNumberOrDefault(value, fallback) {
  return typeof value === "number" && value > 0 ? value : fallback;
}

function nonNegativeNumberOrDefault(value, fallback) {
  return typeof value === "number" && value >= 0 ? value : fallback;
}

function stripJsonCodeFence(value) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}
