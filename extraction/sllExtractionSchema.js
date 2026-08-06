export const sllExtractionSchemaVersion = "sll-readiness-extraction.v2";

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

const sustainabilityInvestmentContract = {
  frameworkVersion: "sustainability-investment-framework.v1",
  summary: "string",
  overallRating: "Strong | Credible | Emerging | Weak | No cited investment evidence",
  carbonCreditOpportunityScore: "number from 0 to 100",
  carbonCreditThesis: "string",
  items: [
    {
      name: "string",
      category:
        "renewable_energy | energy_efficiency | clean_transport | green_buildings | supplier_decarbonization | sustainable_finance | nature_based | carbon_removal | waste_methane | water | circularity | other",
      investmentType: "capex | opex | fund | project | procurement | financing | not specified",
      amount: "string amount or Not disclosed",
      targetArea: "string",
      expectedImpact: "string",
      score: "number from 0 to 100",
      rating: "Strong | Credible | Emerging | Weak",
      carbonCreditRelevance: "High | Medium | Low",
      carbonCreditPathway: "string",
      assessment: "short analyst-style view of whether this investment is good and why",
      citations: [{ quote: "string", pages: ["integer PDF page number"] }],
    },
  ],
};

const sustainabilityProfileContract = {
  sector: {
    key: "semiconductors | ict_technology | development_finance | market_only",
    confidence: "High | Medium | Low",
  },
  emissions: {
    year: "integer | null",
    scope1Tco2e: "number | null",
    scope2Tco2e: "number | null",
    scope3Tco2e: "number | null",
    totalTco2e: "number | null",
    citations: [{ quote: "string", pages: ["integer PDF page number"] }],
  },
  target: {
    baselineYear: "integer | null",
    targetYear: "integer | null",
    reductionPercent: "number | null",
    boundary: "scope1_scope2 | scope1_scope2_scope3 | other",
    citations: [{ quote: "string", pages: ["integer PDF page number"] }],
  },
  internalInvestments: [
    {
      name: "string",
      category: "string",
      amountUsd: "number | null",
      requiredCapitalUsd: "number | null",
      committedCapitalUsd: "number | null",
      expectedAbatementTco2e: "number | null",
      deliveryYear: "integer | null",
      status: "planned | approved | underway | completed | not_disclosed",
      verified: "boolean",
      mrvReady: "boolean",
      emissionsSource: "process gases | electricity | energy efficiency | scope 3 supply chain | low-carbon materials | other | not_disclosed",
      expectedImpact: "string",
      citations: [{ quote: "string", pages: ["integer PDF page number"] }],
    },
  ],
  carbonCredits: {
    disclosureStatus: "disclosed | confirmed_zero | not_disclosed",
    purchasedTco2e: "number | null",
    retiredTco2e: "number | null",
    contractedTco2e: "number | null",
    mix: [{ key: "credit taxonomy key", share: "percentage from 0 to 100" }],
    credits: [{
      name: "string",
      volumeTco2e: "number | null",
      type: "nature_reduction | nature_removal | durable_removal | methane_industrial | community_energy | other",
      registry: "string",
      methodology: "string",
      vintage: "integer | null",
      deliveryYear: "integer | null",
      contractType: "spot | forward | offtake | project investment | not_disclosed",
      ccpApproved: "boolean",
      verified: "boolean",
      additionalityEvidence: "boolean",
      noDoubleCounting: "boolean",
      ownershipConfirmed: "boolean",
      replacementRemedy: "boolean",
      retired: "boolean",
      claimMade: "boolean",
      claimBoundaryConfirmed: "boolean",
      deliveryRiskPercent: "number | null",
      citations: [{ quote: "string", pages: ["integer PDF page number"] }],
    }],
    registry: "string",
    methodology: "string",
    verified: "boolean",
    procurementType: "spot | forward | offtake | project investment | not_disclosed",
    claimMade: "boolean",
    doubleCountingConcern: "boolean",
    citations: [{ quote: "string", pages: ["integer PDF page number"] }],
  },
};

export function buildSllExtractionPrompt({ text, metadata }) {
  return [
    "You are extracting evidence for an SLL readiness report.",
    `Use ${sllpStandard} as the assessment reference.`,
    "Return valid JSON only. Do not include markdown.",
    "Do not invent facts. If evidence is missing, use status \"Needs review\" and explain the missing evidence.",
    "For sustainabilityInvestments, include only investments, capex, funds, projects, procurement, offsets or carbon credit activity that are explicitly cited in the report. Do not convert general strategy language into an investment.",
    "Rate each sustainability investment on use-of-proceeds clarity, decarbonization link, quantified amount/impact, delivery status, verification readiness and carbon-credit pathway. Explain whether the investment is commercially useful for a carbon credit discussion.",
    "Create sustainabilityProfile only from cited facts. Use null or not_disclosed when emissions, target boundaries, required or committed capital, delivery year, abatement, credit volume, registry, methodology, ownership, remedies or retirement are absent. Never interpret silence as confirmed zero.",
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
    sustainabilityInvestments: sustainabilityInvestmentContract,
    sustainabilityProfile: sustainabilityProfileContract,
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
