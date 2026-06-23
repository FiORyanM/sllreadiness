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
      pageNumbers: ["integer PDF page number containing sourceQuote"],
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
    "Every evidence item must quote the supplied text exactly and include the PDF page number from a --- PDF PAGE N --- marker. Do not create an evidence item when either is unavailable.",
    "If a topic is absent, omit it instead of guessing.",
    "Required JSON shape:",
    JSON.stringify(chunkEvidenceContract),
    "Source metadata:",
    JSON.stringify(metadata),
    "Report segment:",
    text,
  ].join("\n");
}

export function validateChunkEvidence(value, sourceText = "") {
  const missing = [];
  if (value?.schemaVersion !== chunkEvidenceSchemaVersion) missing.push("schemaVersion");
  if (!Array.isArray(value?.evidence)) missing.push("evidence");
  if (!Array.isArray(value?.notes)) missing.push("notes");

  for (const [index, item] of (value?.evidence ?? []).entries()) {
    if (!item?.topic) missing.push(`evidence.${index}.topic`);
    if (!item?.finding) missing.push(`evidence.${index}.finding`);
    if (!item?.sourceQuote) missing.push(`evidence.${index}.sourceQuote`);
    if (!Array.isArray(item?.pageNumbers) || item.pageNumbers.length === 0 || item.pageNumbers.some((page) => !Number.isInteger(page) || page < 1)) {
      missing.push(`evidence.${index}.pageNumbers`);
    }
    if (sourceText.includes("--- PDF PAGE") && !quoteAppearsOnClaimedPage(item?.sourceQuote, item?.pageNumbers, sourceText)) {
      missing.push(`evidence.${index}.sourceQuote/pageNumbers`);
    }
  }

  return { ok: missing.length === 0, missing };
}

function quoteAppearsOnClaimedPage(quote, pages, sourceText) {
  if (!quote || !Array.isArray(pages)) return false;
  const normalizedQuote = normalizeForMatch(quote);
  return pages.some((page) => normalizeForMatch(pageText(sourceText, page)).includes(normalizedQuote));
}

function pageText(text, pageNumber) {
  const marker = `--- PDF PAGE ${pageNumber} ---`;
  const start = text.indexOf(marker);
  if (start === -1) return "";
  const nextMarker = text.indexOf("--- PDF PAGE ", start + marker.length);
  return text.slice(start + marker.length, nextMarker === -1 ? text.length : nextMarker);
}

function normalizeForMatch(value) {
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

export function buildFinalMergePrompt({ metadata, evidences }) {
  return [
    "You are producing a final SLL readiness extraction from AI-extracted evidence.",
    `Use ${sllpStandard} as the assessment reference.`,
    "Return strict JSON only. Do not invent facts. Mark unsupported matters as Needs review.",
    "A general ESG report is not expected to contain SLL loan documentation. Do not treat the absence of SLLP or loan wording as a readiness gap; use Needs review for loan characteristics instead.",
    "Score every readiness component from 0 to 100 using the supplied evidence and make High / Partial / Gap agree with that score. Do not use all-zero scores when the evidence contains ESG metrics, targets, reporting, or assurance.",
    "If no actual loan facility is evidenced, use these illustrative deal assumptions exactly: loanSizeM 500, tenor 5, baseMargin 150, ratchetBest 10, ratchetWorst 5. Never use zero placeholders.",
    "List only genuine evidence or execution gaps, such as missing KPI history, methodology, SPT calibration, reporting, or verification.",
    "Every component, KPI and gap must include one or more citations copied from the supplied evidence. If supporting citations are unavailable, use score null and status Insufficient evidence for that component or KPI; omit an unsupported gap.",
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
      kpiDataHistory: { name: "string", score: "number | null", maturity: "high | medium | low | absent", status: "High | Partial | Gap | Insufficient evidence", citations: [{ quote: "string", pages: ["number"] }] },
      kpiMethodology: { name: "string", score: "number | null", maturity: "high | medium | low | absent", status: "High | Partial | Gap | Insufficient evidence", citations: [{ quote: "string", pages: ["number"] }] },
      reportingInfrastructure: { name: "string", score: "number | null", maturity: "high | medium | low | absent", status: "High | Partial | Gap | Insufficient evidence", citations: [{ quote: "string", pages: ["number"] }] },
      externalVerification: { name: "string", score: "number | null", maturity: "high | medium | low | absent", status: "High | Partial | Gap | Insufficient evidence", citations: [{ quote: "string", pages: ["number"] }] },
      strategicAlignment: { name: "string", score: "number | null", maturity: "high | medium | low | absent", status: "High | Partial | Gap | Insufficient evidence", citations: [{ quote: "string", pages: ["number"] }] },
    },
  },
  analysis: {
    kpis: [{ name: "string", evidence: "string", status: "Ready | Partial | Insufficient evidence", confidence: "high | medium | low", citations: [{ quote: "string", pages: ["number"] }] }],
    gaps: [{ title: "string", description: "string", severity: "High | Medium | Low", citations: [{ quote: "string", pages: ["number"] }] }],
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
