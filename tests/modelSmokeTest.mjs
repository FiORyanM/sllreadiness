import assert from "node:assert/strict";
import { aiibFixture } from "../fixtures/aiib.js";
import {
  estimatePageCount,
  extractTextFromPdfSource,
  isLikelyScannedPdf,
  validatePdfFile,
} from "../extraction/pdfExtractionAdapter.js";
import { extractSllReadinessJson, validateSllExtractionJson } from "../extraction/sllExtractionAdapter.js";
import { extractSllReadinessWithLlm, normalizeLlmExtractionResponse } from "../extraction/llmExtractionAdapter.js";
import { deepseekProvider } from "../extraction/providers/deepseekProvider.js";
import { nvidiaProvider } from "../extraction/providers/nvidiaProvider.js";
import { buildSllExtractionPrompt, sllExtractionSchemaVersion } from "../extraction/sllExtractionSchema.js";
import { calculateExecutionCost } from "../models/costModel.js";
import { calculateScenario } from "../models/financialModel.js";
import { weightedReadinessFromScores } from "../models/scoringModel.js";

const scoring = weightedReadinessFromScores(aiibFixture.modelInputs.componentsByKey);

assert.equal(scoring.band, "high");
assert.equal(scoring.score100, 88);

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

console.log("Model smoke tests passed.");
