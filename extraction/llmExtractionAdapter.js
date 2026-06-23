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

export async function extractSllReadinessWithChunkedLlm({
  text,
  metadata,
  provider = mockLlmProvider,
  chunkSize = 24000,
  overlap = 1200,
  retries = 1,
  minChunkSize = 3500,
}) {
  const chunks = chunkText(text, { chunkSize, overlap });
  const results = [];

  for (const [index, chunk] of chunks.entries()) {
    const chunkResults = await extractChunkRecursively({
      text: chunk,
      metadata: {
        ...metadata,
        extractedCharCount: chunk.length,
        truncated: true,
        chunkIndex: index + 1,
        chunkCount: chunks.length,
      },
      provider,
      retries,
      minChunkSize,
    });

    results.push(...chunkResults.map((result) => result.extraction));
  }

  const extraction = mergeChunkExtractions(results, metadata);
  const validation = validateSllExtractionContract(extraction);

  return {
    ok: validation.ok,
    extraction,
    validation,
    chunkCount: chunks.length,
  };
}

async function extractChunkRecursively({ text, metadata, provider, retries, minChunkSize }) {
  try {
    const result = await extractChunkWithRetry({ text, metadata, provider, retries });

    if (!result.ok) {
      throw new Error(`Chunk validation failed: ${result.validation?.missing?.join(", ") || "unknown"}`);
    }

    return [result];
  } catch (error) {
    if (text.length <= minChunkSize) {
      throw new Error(`Chunk ${metadata.chunkIndex}/${metadata.chunkCount} failed at ${text.length} chars: ${error.message}`);
    }

    const midpoint = findSoftBreak(text, 0, Math.ceil(text.length / 2));
    const left = text.slice(0, midpoint);
    const right = text.slice(midpoint);
    const leftResults = await extractChunkRecursively({
      text: left,
      metadata: {
        ...metadata,
        extractedCharCount: left.length,
      },
      provider,
      retries,
      minChunkSize,
    });
    const rightResults = await extractChunkRecursively({
      text: right,
      metadata: {
        ...metadata,
        extractedCharCount: right.length,
      },
      provider,
      retries,
      minChunkSize,
    });

    return [...leftResults, ...rightResults];
  }
}

async function extractChunkWithRetry({ text, metadata, provider, retries }) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await extractSllReadinessWithLlm({ text, metadata, provider });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
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

export function mergeChunkExtractions(extractions, metadata) {
  const first = extractions[0];
  const kpis = uniqueByName(extractions.flatMap((extraction) => extraction.analysis?.kpis ?? []));
  const gaps = uniqueByName(extractions.flatMap((extraction) => extraction.analysis?.gaps ?? []), "title");
  const componentsByKey = mergeComponents(extractions.map((extraction) => extraction.modelInputs?.componentsByKey ?? {}));
  const readyKpiCount = kpis.filter((kpi) => kpi.status === "Ready").length;

  return applyExtractionDefaults({
    ...first,
    schemaVersion: sllExtractionSchemaVersion,
    extractionMode: "chunked-llm-extraction",
    source: {
      ...first.source,
      ...metadata,
      extractedCharCount: metadata.extractedCharCount ?? first.source?.extractedCharCount,
      truncated: false,
    },
    company: mergeCompany(extractions),
    modelInputs: {
      ...first.modelInputs,
      recommendedKpiCount: Math.max(Math.min(readyKpiCount, 2), 1),
      hasLowConfidence: extractions.some((extraction) => extraction.modelInputs?.hasLowConfidence),
      bestCaseSetupFloors: {},
      worstCaseExcludedDrivers: [],
      componentsByKey,
    },
    analysis: {
      ...first.analysis,
      kpis,
      gaps,
      sllpAlignment: mergeSllpAlignment(extractions),
      baseMarginNote:
        first.analysis?.baseMarginNote ||
        "150bps is a generic placeholder for first-pass screening. Replace with actual loan margin for decision-useful economics.",
    },
    confidence: {
      overall: mergeOverallConfidence(extractions),
      notes: [
        `Chunked AI extraction merged ${extractions.length} report segments.`,
        ...extractions.flatMap((extraction) => extraction.confidence?.notes ?? []).slice(0, 4),
      ],
    },
  });
}

export function chunkText(text, { chunkSize, overlap }) {
  if (text.length <= chunkSize) return [text];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const hardEnd = Math.min(start + chunkSize, text.length);
    const softEnd = findSoftBreak(text, start, hardEnd);
    const chunk = text.slice(start, softEnd);
    // A chunk can start after its page marker because of overlap. Restore the
    // current marker so the evidence extractor can make an auditable citation.
    chunks.push(withCurrentPageMarker(text, start, chunk));
    if (softEnd >= text.length) break;
    start = Math.max(softEnd - overlap, start + 1);
  }

  return chunks;
}

function withCurrentPageMarker(text, start, chunk) {
  if (chunk.startsWith("--- PDF PAGE")) return chunk;
  const beforeChunk = text.slice(0, start);
  const markerStart = beforeChunk.lastIndexOf("--- PDF PAGE ");
  if (markerStart === -1) return chunk;
  const markerEnd = text.indexOf("\n", markerStart);
  if (markerEnd === -1) return chunk;
  return `${text.slice(markerStart, markerEnd)}\n${chunk}`;
}

function findSoftBreak(text, start, hardEnd) {
  const windowStart = Math.max(start + Math.floor((hardEnd - start) * 0.75), start);
  const slice = text.slice(windowStart, hardEnd);
  const pageBreak = slice.lastIndexOf("--- PDF PAGE");
  if (pageBreak > 0) return windowStart + pageBreak;
  const paragraphBreak = slice.lastIndexOf("\n\n");
  if (paragraphBreak > 0) return windowStart + paragraphBreak;
  return hardEnd;
}

function mergeCompany(extractions) {
  const companies = extractions.map((extraction) => extraction.company).filter(Boolean);
  const company = companies.find((item) => /nvidia/i.test(item.name)) ?? companies[0] ?? {};

  return {
    name: company.name || "Uploaded company",
    reportTitle: company.reportTitle || "Uploaded ESG report",
    reportingYear: company.reportingYear || "",
  };
}

function mergeComponents(componentSets) {
  const merged = {};

  for (const key of Object.keys(componentLabels)) {
    const components = componentSets.map((set) => set[key]).filter(Boolean);
    const best = components.reduce((winner, component) => {
      if (!winner) return component;
      return (component.score ?? 0) > (winner.score ?? 0) ? component : winner;
    }, null);

    merged[key] = {
      ...best,
      name: componentLabels[key],
      score: best?.score ?? 0,
      maturity: best?.maturity ?? "absent",
      status: best?.status ?? "Gap",
    };
  }

  return merged;
}

function mergeSllpAlignment(extractions) {
  const coreComponents = {};
  const keys = ["selectionOfKpis", "calibrationOfSpts", "loanCharacteristics", "reporting", "verification"];

  for (const key of keys) {
    const items = extractions
      .map((extraction) => extraction.analysis?.sllpAlignment?.coreComponents?.[key])
      .filter(Boolean);
    const detected = items.find((item) => item.status === "Detected");
    const selected = detected ?? items[0] ?? { status: "Needs review", note: "Evidence not detected in chunked extraction." };
    coreComponents[key] = selected;
  }

  return {
    standard: firstValue(extractions, (extraction) => extraction.analysis?.sllpAlignment?.standard) ||
      "Sustainability-Linked Loan Principles, 26 March 2025",
    coreComponents,
  };
}

function mergeOverallConfidence(extractions) {
  if (extractions.some((extraction) => extraction.confidence?.overall === "low")) return "medium";
  if (extractions.every((extraction) => extraction.confidence?.overall === "high")) return "high";
  return "medium";
}

function uniqueByName(items, key = "name") {
  const byName = new Map();

  for (const item of items) {
    const name = (item[key] || "").toLowerCase().trim();
    if (!name) continue;
    const existing = byName.get(name);
    if (!existing || rankItem(item) > rankItem(existing)) byName.set(name, item);
  }

  return Array.from(byName.values()).slice(0, 6);
}

function rankItem(item) {
  const statusScore = item.status === "Ready" || item.status === "Detected" ? 2 : 1;
  const confidenceScore = item.confidence === "high" ? 2 : item.confidence === "medium" ? 1 : 0;
  const severityScore = item.severity === "High" ? 2 : item.severity === "Medium" ? 1 : 0;
  return statusScore + confidenceScore + severityScore;
}

function firstValue(items, getter) {
  for (const item of items) {
    const value = getter(item);
    if (value) return value;
  }
  return "";
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
