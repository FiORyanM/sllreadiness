export const sllExtractionSchemaVersion = "sll-readiness-extraction.v1";

export const sllpStandard = "Sustainability-Linked Loan Principles, 26 March 2025";

export const sllComponentKeys = [
  "kpiDataHistory",
  "kpiMethodology",
  "reportingInfrastructure",
  "externalVerification",
  "strategicAlignment",
];

export const sllpCoreComponentKeys = [
  "selectionOfKpis",
  "calibrationOfSpts",
  "loanCharacteristics",
  "reporting",
  "verification",
];

export function buildSllExtractionPrompt({ text, metadata }) {
  return [
    "You are extracting evidence for an SLL readiness report.",
    `Use ${sllpStandard} as the assessment reference.`,
    "Return valid JSON only. Do not include markdown.",
    "Do not invent facts. If evidence is missing, use status \"Needs review\" and explain the missing evidence.",
    "",
    "Required JSON shape:",
    JSON.stringify(sllExtractionJsonContract, null, 2),
    "",
    "Source metadata:",
    JSON.stringify(metadata, null, 2),
    "",
    "Extracted report text:",
    text,
  ].join("\n");
}

const componentContract = {
  name: "string",
  score: "number from 0 to 100, or null when evidence is insufficient",
  maturity: "high | medium | low | absent",
  status: "High | Partial | Gap | Insufficient evidence",
  citations: [{ quote: "string", pages: ["integer PDF page number"] }],
};

const alignmentContract = {
  status: "Detected | Needs review",
  note: "string",
};

export const sllExtractionJsonContract = {
  schemaVersion: sllExtractionSchemaVersion,
  extractionMode: "llm-extraction",
  source: {
    fileName: "string",
    fileSizeBytes: "number",
    pageCount: "number",
    extractedCharCount: "number",
    truncated: "boolean",
  },
  company: {
    name: "string",
    reportTitle: "string",
    reportingYear: "string",
  },
  dealDefaults: {
    loanSizeM: "number",
    tenor: "number",
    baseMargin: "number",
    ratchetBest: "number",
    ratchetWorst: "number",
  },
  modelInputs: {
    recommendedKpiCount: "number",
    hasLowConfidence: "boolean",
    bestCaseSetupFloors: "object",
    worstCaseExcludedDrivers: "array",
    componentsByKey: {
      kpiDataHistory: componentContract,
      kpiMethodology: componentContract,
      reportingInfrastructure: componentContract,
      externalVerification: componentContract,
      strategicAlignment: componentContract,
    },
  },
  analysis: {
    kpis: [
      {
        name: "string",
        evidence: "short evidence snippet or reason evidence is missing",
        status: "Ready | Partial | Insufficient evidence",
        confidence: "high | medium | low",
        citations: [{ quote: "string", pages: ["integer PDF page number"] }],
      },
    ],
    gaps: [
      {
        title: "string",
        description: "string",
        severity: "High | Medium | Low",
        citations: [{ quote: "string", pages: ["integer PDF page number"] }],
      },
    ],
    sllpAlignment: {
      standard: sllpStandard,
      coreComponents: {
        selectionOfKpis: alignmentContract,
        calibrationOfSpts: alignmentContract,
        loanCharacteristics: alignmentContract,
        reporting: alignmentContract,
        verification: alignmentContract,
      },
    },
    baseMarginNote: "string",
  },
  confidence: {
    overall: "high | medium | low",
    notes: ["string"],
  },
};

export function validateSllExtractionContract(extraction) {
  const missing = [];

  if (extraction?.schemaVersion !== sllExtractionSchemaVersion) missing.push("schemaVersion");
  if (!extraction?.source?.fileName) missing.push("source.fileName");
  if (!extraction?.company?.name) missing.push("company.name");
  if (!extraction?.modelInputs?.componentsByKey) missing.push("modelInputs.componentsByKey");
  if (!Array.isArray(extraction?.analysis?.kpis)) missing.push("analysis.kpis");
  if (!Array.isArray(extraction?.analysis?.gaps)) missing.push("analysis.gaps");
  if (!extraction?.analysis?.sllpAlignment?.coreComponents) missing.push("analysis.sllpAlignment.coreComponents");

  for (const key of sllComponentKeys) {
    const component = extraction?.modelInputs?.componentsByKey?.[key];
    if (!component?.maturity) missing.push(`modelInputs.componentsByKey.${key}.maturity`);
    if (typeof component?.score !== "number" && component?.score !== null) missing.push(`modelInputs.componentsByKey.${key}.score`);
  }

  for (const key of sllpCoreComponentKeys) {
    if (!extraction?.analysis?.sllpAlignment?.coreComponents?.[key]?.status) {
      missing.push(`analysis.sllpAlignment.coreComponents.${key}.status`);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}
