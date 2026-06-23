import { sllExtractionSchemaVersion, sllpStandard, validateSllExtractionContract } from "./sllExtractionSchema.js";

export const chunkEvidenceSchemaVersion = "sll-chunk-evidence.v1";

const chunkEvidenceContract = {
  schemaVersion: chunkEvidenceSchemaVersion,
  companyHints: { name: "string", reportTitle: "string", reportingYear: "string" },
  evidence: [
    {
      topic: "KPI | target | methodology | reporting | verification | strategy | gap",
      finding: "short factual finding",
      sourceQuote: "short source quote",
      confidence: "high | medium | low",
    },
  ],
  notes: ["short note"],
};

export function buildChunkEvidencePrompt({ text, metadata }) {
  return [
    "Extract factual SLL readiness evidence from this ESG report segment.",
    `Assess against ${sllpStandard}.`,
    "Return strict JSON only. Do not score the company, invent facts, or write markdown.",
    "Keep sourceQuote under 240 characters and return at most 12 evidence items.",
    "If a topic is absent, omit it instead of guessing.",
    "Required JSON shape:",
    JSON.stringify(chunkEvidenceContract),
    "Source metadata:",
    JSON.stringify(metadata),
    "Report segment:",
    text,
  ].join("\n");
}

export function validateChunkEvidence(value) {
  const missing = [];
  if (value?.schemaVersion !== chunkEvidenceSchemaVersion) missing.push("schemaVersion");
  if (!Array.isArray(value?.evidence)) missing.push("evidence");
  if (!Array.isArray(value?.notes)) missing.push("notes");

  for (const [index, item] of (value?.evidence ?? []).entries()) {
    if (!item?.topic) missing.push(`evidence.${index}.topic`);
    if (!item?.finding) missing.push(`evidence.${index}.finding`);
  }

  return { ok: missing.length === 0, missing };
}

export function buildFinalMergePrompt({ metadata, evidences }) {
  return [
    "You are producing a final SLL readiness extraction from AI-extracted evidence.",
    `Use ${sllpStandard} as the assessment reference.`,
    "Return strict JSON only. Do not invent facts. Mark unsupported matters as Needs review.",
    "The result must follow this exact contract:",
    JSON.stringify(finalExtractionContract),
    "Source metadata:",
    JSON.stringify(metadata),
    "AI evidence from all report segments:",
    JSON.stringify(evidences),
  ].join("\n");
}

const finalExtractionContract = {
  schemaVersion: sllExtractionSchemaVersion,
  extractionMode: "ai-merged-extraction",
  source: { fileName: "string", fileSizeBytes: "number", pageCount: "number", extractedCharCount: "number", truncated: false },
  company: { name: "string", reportTitle: "string", reportingYear: "string" },
  dealDefaults: { loanSizeM: "number", tenor: "number", baseMargin: "number", ratchetBest: "number", ratchetWorst: "number" },
  modelInputs: {
    recommendedKpiCount: "number",
    hasLowConfidence: "boolean",
    bestCaseSetupFloors: {},
    worstCaseExcludedDrivers: [],
    componentsByKey: {
      kpiDataHistory: { name: "string", score: "number", maturity: "high | medium | low | absent", status: "High | Partial | Gap" },
      kpiMethodology: { name: "string", score: "number", maturity: "high | medium | low | absent", status: "High | Partial | Gap" },
      reportingInfrastructure: { name: "string", score: "number", maturity: "high | medium | low | absent", status: "High | Partial | Gap" },
      externalVerification: { name: "string", score: "number", maturity: "high | medium | low | absent", status: "High | Partial | Gap" },
      strategicAlignment: { name: "string", score: "number", maturity: "high | medium | low | absent", status: "High | Partial | Gap" },
    },
  },
  analysis: {
    kpis: [{ name: "string", evidence: "string", status: "Ready | Partial", confidence: "high | medium | low" }],
    gaps: [{ title: "string", description: "string", severity: "High | Medium | Low" }],
    sllpAlignment: {
      standard: sllpStandard,
      coreComponents: {
        selectionOfKpis: { status: "Detected | Needs review", note: "string" },
        calibrationOfSpts: { status: "Detected | Needs review", note: "string" },
        loanCharacteristics: { status: "Detected | Needs review", note: "string" },
        reporting: { status: "Detected | Needs review", note: "string" },
        verification: { status: "Detected | Needs review", note: "string" },
      },
    },
    baseMarginNote: "string",
  },
  confidence: { overall: "high | medium | low", notes: ["string"] },
};

export function validateFinalExtraction(value) {
  return validateSllExtractionContract(value);
}
