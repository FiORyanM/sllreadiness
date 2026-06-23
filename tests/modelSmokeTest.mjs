import assert from "node:assert/strict";
import { aiibFixture } from "../fixtures/aiib.js";
import { nvidiaFixture } from "../fixtures/nvidia.js";
import { tsmcFixture } from "../fixtures/tsmc.js";
import {
  estimatePageCount,
  extractTextFromPdfSource,
  isLikelyScannedPdf,
  validatePdfFile,
} from "../extraction/pdfExtractionAdapter.js";
import { extractSllReadinessJson, validateSllExtractionJson } from "../extraction/sllExtractionAdapter.js";
import { extractSllReadinessWithLlm, normalizeLlmExtractionResponse } from "../extraction/llmExtractionAdapter.js";
import { createExtractionJobQueue } from "../extraction/extractionJobQueue.js";
import { deepseekProvider } from "../extraction/providers/deepseekProvider.js";
import { configuredAiProviders } from "../extraction/aiProviderPool.js";
import { geminiProvider } from "../extraction/providers/geminiProvider.js";
import { groqProvider } from "../extraction/providers/groqProvider.js";
import { nvidiaProvider } from "../extraction/providers/nvidiaProvider.js";
import { buildSllExtractionPrompt, sllExtractionSchemaVersion } from "../extraction/sllExtractionSchema.js";
import { calculateExecutionCost } from "../models/costModel.js";
import { calculateScenario } from "../models/financialModel.js";
import { weightedReadinessFromScores } from "../models/scoringModel.js";

const scoring = weightedReadinessFromScores(aiibFixture.modelInputs.componentsByKey);

const nvidiaModelPool = configuredAiProviders({
  NVIDIA_API_KEY: "test-nvidia-key",
  NVIDIA_MODEL: "deepseek-ai/deepseek-v4-flash",
  NVIDIA_REQUESTS_PER_MINUTE: "20",
  NVIDIA_QWEN_MODEL: "qwen/qwen3-32b",
  NVIDIA_QWEN_REQUESTS_PER_MINUTE: "15",
});

assert.deepEqual(nvidiaModelPool.map((provider) => provider.name), ["nvidia", "nvidia-qwen"]);
assert.equal(nvidiaModelPool[0].config.model, "deepseek-ai/deepseek-v4-flash");
assert.equal(nvidiaModelPool[1].config.model, "qwen/qwen3-32b");
assert.equal(nvidiaModelPool[1].requestsPerMinute, 15);

assert.equal(scoring.band, "high");
assert.equal(scoring.score100, 88);

const nvidiaScoring = weightedReadinessFromScores(nvidiaFixture.modelInputs.componentsByKey);

assert.equal(nvidiaScoring.band, "high");
assert.equal(nvidiaScoring.score100, 89);
assert.equal(nvidiaFixture.analysis.kpis.length, 4);

const tsmcScoring = weightedReadinessFromScores(tsmcFixture.modelInputs.componentsByKey);

assert.equal(tsmcScoring.band, "high");
assert.equal(tsmcScoring.score100, 91);
assert.equal(tsmcFixture.analysis.kpis.length, 4);

const executionCost = calculateExecutionCost({
  readinessBand: scoring.band,
  kpiCount: aiibFixture.modelInputs.recommendedKpiCount,
  tenor: aiibFixture.dealDefaults.tenor,
  hasLowConfidence: aiibFixture.modelInputs.hasLowConfidence,
  options: {
    bestCaseSetupFloors: aiibFixture.modelInputs.bestCaseSetupFloors,
    worstCaseExcludedDrivers: aiibFixture.modelInputs.worstCaseExcludedDrivers,
  },
});

assert.equal(executionCost.best, 125000);
assert.equal(executionCost.worst, 295000);

const inputs = {
  loanSize: aiibFixture.dealDefaults.loanSizeM * 1_000_000,
  tenor: aiibFixture.dealDefaults.tenor,
  baseMargin: aiibFixture.dealDefaults.baseMargin,
};

const best = calculateScenario(inputs, aiibFixture.dealDefaults.ratchetBest, executionCost.best);
const worst = calculateScenario(inputs, aiibFixture.dealDefaults.ratchetWorst, executionCost.worst);

assert.equal(best.netSaving, 2875000);
assert.equal(worst.netSaving, 955000);

assert.equal(
  validatePdfFile({
    name: "large-report.pdf",
    size: 16 * 1024 * 1024,
    type: "application/octet-stream",
  }).ok,
  true,
);
assert.equal(
  validatePdfFile({
    name: "oversized-report.pdf",
    size: 21 * 1024 * 1024,
    type: "application/pdf",
  }).ok,
  false,
);

const pdfSource = `
  1 0 obj << /Type /Page >> endobj
  BT /F1 12 Tf (Asian Infrastructure Investment Bank Sustainability Report 2024) Tj ET
  BT (Climate finance target and GHG Protocol methodology with limited assurance) Tj ET
  BT (Scope 1 Scope 2 emissions, net zero strategy and three-year KPI history) Tj ET
`;
const extractedText = extractTextFromPdfSource(pdfSource);

assert.match(extractedText, /Asian Infrastructure Investment Bank/);
assert.equal(estimatePageCount(pdfSource), 1);
assert.equal(
  isLikelyScannedPdf({
    text: "",
    pageCount: 3,
    imageObjectCount: 3,
    textOperatorCount: 0,
  }),
  true,
);

const extraction = extractSllReadinessJson({
  text: extractedText,
  metadata: {
    fileName: "aiib-test.pdf",
    fileSizeBytes: 1000,
    pageCount: 1,
    extractedCharCount: extractedText.length,
    truncated: false,
  },
});

assert.equal(validateSllExtractionJson(extraction).ok, true);
assert.equal(extraction.company.name, "Asian Infrastructure Investment Bank");

const prompt = buildSllExtractionPrompt({
  text: extractedText,
  metadata: {
    fileName: "aiib-test.pdf",
    fileSizeBytes: 1000,
    pageCount: 1,
    extractedCharCount: extractedText.length,
    truncated: false,
  },
});

assert.match(prompt, /Sustainability-Linked Loan Principles, 26 March 2025/);
assert.match(prompt, /valid JSON only/);

const llmExtractionResult = await extractSllReadinessWithLlm({
  text: extractedText,
  metadata: {
    fileName: "aiib-test.pdf",
    fileSizeBytes: 1000,
    pageCount: 1,
    extractedCharCount: extractedText.length,
    truncated: false,
  },
});

assert.equal(llmExtractionResult.ok, true);
assert.equal(llmExtractionResult.extraction.schemaVersion, sllExtractionSchemaVersion);
assert.equal(llmExtractionResult.extraction.extractionMode, "mock-llm-provider");

const normalizedJson = normalizeLlmExtractionResponse(`\`\`\`json
${JSON.stringify(llmExtractionResult.extraction)}
\`\`\``);

assert.equal(normalizedJson.schemaVersion, sllExtractionSchemaVersion);

await assert.rejects(
  () =>
    deepseekProvider({
      prompt: "Return JSON.",
      schemaVersion: sllExtractionSchemaVersion,
      config: { apiKey: "" },
    }),
  /DEEPSEEK_API_KEY/,
);

await assert.rejects(
  () =>
    nvidiaProvider({
      prompt: "Return JSON.",
      schemaVersion: sllExtractionSchemaVersion,
      config: { apiKey: "" },
    }),
  /NVIDIA_API_KEY/,
);

await assert.rejects(
  () => geminiProvider({ prompt: "Return JSON.", schemaVersion: sllExtractionSchemaVersion, config: { apiKey: "", model: "" } }),
  /GEMINI_API_KEY/,
);

await assert.rejects(
  () => groqProvider({ prompt: "Return JSON.", schemaVersion: sllExtractionSchemaVersion, config: { apiKey: "", model: "" } }),
  /GROQ_API_KEY/,
);

const queueText = "Sustainability report with GHG emissions, Scope 1, Scope 2, energy targets and limited assurance. ".repeat(900);
let providerCalls = 0;
const queue = createExtractionJobQueue({
  provider: async ({ text, metadata }) => {
    providerCalls += 1;
    return {
      ...extractSllReadinessJson({ text, metadata }),
      schemaVersion: sllExtractionSchemaVersion,
      extractionMode: "test-provider",
    };
  },
  requestsPerMinute: Infinity,
});
const queueMetadata = {
  fileName: "queue-test.pdf",
  fileSizeBytes: 1000,
  pageCount: 4,
  extractedCharCount: queueText.length,
  truncated: false,
};
const queuedJob = queue.createJob({ text: queueText, metadata: queueMetadata });
let queuedStatus = queue.getJob(queuedJob.id);
while (queuedStatus.status === "queued" || queuedStatus.status === "processing") {
  await new Promise((resolve) => setTimeout(resolve, 5));
  queuedStatus = queue.getJob(queuedJob.id);
}
assert.equal(queuedStatus.status, "completed");
assert.equal(queuedStatus.progress.total > 1, true);
assert.equal(queuedStatus.result.extraction.schemaVersion, sllExtractionSchemaVersion);

const cachedJob = queue.createJob({ text: queueText, metadata: queueMetadata });
assert.equal(cachedJob.status, "completed");
assert.equal(cachedJob.cacheHit, true);
assert.equal(providerCalls, queuedStatus.progress.total);

let flakyCalls = 0;
const retryDelays = [];
const retryQueue = createExtractionJobQueue({
  provider: async ({ text, metadata }) => {
    flakyCalls += 1;
    if (flakyCalls === 1) throw new Error("NVIDIA API failed with 429: rate limited");
    return {
      ...extractSllReadinessJson({ text, metadata }),
      schemaVersion: sllExtractionSchemaVersion,
      extractionMode: "test-provider",
    };
  },
  requestsPerMinute: Infinity,
  sleep: async (milliseconds) => {
    retryDelays.push(milliseconds);
  },
});
const retryJob = retryQueue.createJob({ text: extractedText, metadata: queueMetadata });
let retryStatus = retryQueue.getJob(retryJob.id);
while (retryStatus.status === "queued" || retryStatus.status === "processing") {
  await new Promise((resolve) => setTimeout(resolve, 5));
  retryStatus = retryQueue.getJob(retryJob.id);
}
assert.equal(retryStatus.status, "completed");
assert.equal(flakyCalls, 2);
assert.deepEqual(retryDelays, [5_000]);

console.log("Model smoke tests passed.");
