const componentLabels = {
  kpiDataHistory: "KPI data history",
  kpiMethodology: "KPI methodology",
  reportingInfrastructure: "Reporting infrastructure",
  externalVerification: "External verification",
  strategicAlignment: "Strategic alignment",
};

const defaultDealDefaults = {
  loanSizeM: 500,
  tenor: 5,
  baseMargin: 150,
  ratchetBest: 10,
  ratchetWorst: 5,
};

export function extractSllReadinessJson({ text, metadata }) {
  const normalized = text.toLowerCase();
  const detectedCompany = detectCompanyName(text, metadata.fileName);
  const reportingYear = detectReportingYear(text);
  const signals = detectSignals(normalized);
  const componentsByKey = buildComponentInputs(signals);
  const kpis = detectCandidateKpis(text, normalized);
  const gaps = detectGaps(signals, kpis);
  const hasLowConfidence = signals.lowConfidence || kpis.some((kpi) => kpi.confidence === "low");

  return {
    schemaVersion: "sll-readiness-extraction.v0",
    extractionMode: "browser-rule-adapter",
    source: {
      fileName: metadata.fileName,
      fileSizeBytes: metadata.fileSizeBytes,
      pageCount: metadata.pageCount,
      extractedCharCount: metadata.extractedCharCount,
      truncated: metadata.truncated,
    },
    company: {
      name: detectedCompany,
      reportTitle: reportingYear ? `${reportingYear} sustainability report` : "Uploaded ESG report",
      reportingYear,
    },
    dealDefaults: defaultDealDefaults,
    modelInputs: {
      recommendedKpiCount: Math.max(Math.min(kpis.filter((kpi) => kpi.status === "Ready").length, 2), 1),
      hasLowConfidence,
      bestCaseSetupFloors: {},
      worstCaseExcludedDrivers: [],
      componentsByKey,
    },
    analysis: {
      kpis,
      gaps,
      baseMarginNote:
        "150bps is a generic placeholder for first-pass screening. Replace with actual loan margin for decision-useful economics.",
    },
    confidence: {
      overall: hasLowConfidence ? "medium" : "high",
      notes: [
        "First-pass extraction uses browser-side text heuristics.",
        "Anthropic extraction should replace this adapter once a backend is added.",
      ],
    },
  };
}

export function validateSllExtractionJson(extraction) {
  const missing = [];

  if (!extraction?.company?.name) missing.push("company.name");
  if (!extraction?.modelInputs?.componentsByKey) missing.push("modelInputs.componentsByKey");
  if (!Array.isArray(extraction?.analysis?.kpis)) missing.push("analysis.kpis");
  if (!Array.isArray(extraction?.analysis?.gaps)) missing.push("analysis.gaps");

  for (const key of Object.keys(componentLabels)) {
    if (!extraction?.modelInputs?.componentsByKey?.[key]?.maturity) {
      missing.push(`modelInputs.componentsByKey.${key}.maturity`);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

function detectSignals(normalized) {
  const hasThreeYearHistory =
    /\b(three|3)[-\s]?year\b/.test(normalized) ||
    /\b20(?:2[0-6]|1[8-9])\b.*\b20(?:2[0-6]|1[8-9])\b.*\b20(?:2[0-6]|1[8-9])\b/.test(normalized);
  const hasTargets = /target|spt|sustainability performance target|net zero|paris aligned|science based/.test(normalized);
  const hasMethodology = /methodolog|baseline|calculation|ghg protocol|pcaf|iso 14064|scope 1|scope 2/.test(normalized);
  const hasReporting = /sustainability report|annual report|tcfd|ifrs s|gri|sasb|issb|data governance/.test(normalized);
  const hasVerification = /assur|verified|verification|third[-\s]?party|external review|limited assurance|reasonable assurance/.test(
    normalized,
  );
  const hasStrategy = /strategy|transition plan|climate action|sustainable finance|sustainability framework|governance/.test(
    normalized,
  );
  const hasScope3Gap = /scope 3/.test(normalized) && /excluded|partial|not included|limited|coverage/.test(normalized);

  return {
    hasThreeYearHistory,
    hasTargets,
    hasMethodology,
    hasReporting,
    hasVerification,
    hasStrategy,
    hasScope3Gap,
    lowConfidence: normalized.length < 3000,
  };
}

function buildComponentInputs(signals) {
  return {
    kpiDataHistory: component("kpiDataHistory", signals.hasThreeYearHistory ? 80 : 45),
    kpiMethodology: component("kpiMethodology", signals.hasMethodology && signals.hasTargets ? 78 : signals.hasMethodology ? 62 : 35),
    reportingInfrastructure: component("reportingInfrastructure", signals.hasReporting ? 82 : 48),
    externalVerification: component("externalVerification", signals.hasVerification ? 80 : 25),
    strategicAlignment: component("strategicAlignment", signals.hasStrategy && signals.hasTargets ? 76 : signals.hasStrategy ? 58 : 38),
  };
}

function component(key, score) {
  return {
    name: componentLabels[key],
    score,
    maturity: scoreToMaturity(score),
    status: score >= 75 ? "High" : score >= 50 ? "Partial" : "Gap",
  };
}

function scoreToMaturity(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "absent";
}

function detectCandidateKpis(text, normalized) {
  const candidates = [];

  addIf(candidates, /climate finance|green finance|sustainable finance/.test(normalized), {
    name: "Sustainable finance share",
    evidence: evidenceFor(text, /(climate|green|sustainable) finance[^.]{0,140}/i),
    status: "Ready",
    confidence: "medium",
  });

  addIf(candidates, /ghg|greenhouse gas|scope 1|scope 2|emissions/.test(normalized), {
    name: "GHG emissions intensity",
    evidence: evidenceFor(text, /(ghg|greenhouse gas|scope 1|scope 2|emissions)[^.]{0,140}/i),
    status: /assur|verified|iso 14064|third[-\s]?party/i.test(text) ? "Ready" : "Partial",
    confidence: "medium",
  });

  addIf(candidates, /renewable energy|electricity|energy consumption/.test(normalized), {
    name: "Renewable energy share",
    evidence: evidenceFor(text, /(renewable energy|electricity|energy consumption)[^.]{0,140}/i),
    status: "Partial",
    confidence: "medium",
  });

  addIf(candidates, /paris aligned|transition|net zero|science based/.test(normalized), {
    name: "Paris-aligned transition progress",
    evidence: evidenceFor(text, /(paris aligned|transition|net zero|science based)[^.]{0,140}/i),
    status: "Ready",
    confidence: "medium",
  });

  if (candidates.length === 0) {
    candidates.push({
      name: "ESG performance KPI",
      evidence: "Text was extracted, but no specific KPI could be identified with high confidence.",
      status: "Partial",
      confidence: "low",
    });
  }

  return candidates.slice(0, 4);
}

function detectGaps(signals, kpis) {
  const gaps = [];

  if (!signals.hasVerification) {
    gaps.push({
      title: "External verification not clearly detected",
      description: "Add or evidence third-party assurance for SLL KPI reporting before lender outreach.",
      severity: "Medium",
    });
  }

  if (!signals.hasThreeYearHistory) {
    gaps.push({
      title: "KPI history may be insufficient",
      description: "Confirm at least three years of comparable KPI data and baseline methodology.",
      severity: "Medium",
    });
  }

  if (signals.hasScope3Gap) {
    gaps.push({
      title: "Scope 3 disclosure appears incomplete",
      description: "Avoid using incomplete Scope 3 coverage as an SPT KPI until coverage and methodology improve.",
      severity: "Medium",
    });
  }

  if (kpis.every((kpi) => kpi.status === "Partial")) {
    gaps.push({
      title: "KPI candidates need lender calibration",
      description: "Convert disclosed ESG metrics into ambitious, benchmarkable SPTs with annual observation dates.",
      severity: "Medium",
    });
  }

  if (gaps.length === 0) {
    gaps.push({
      title: "No major first-pass gaps detected",
      description: "Proceed to evidence review, SPT calibration and verification planning.",
      severity: "Low",
    });
  }

  return gaps;
}

function detectCompanyName(text, fileName) {
  const firstChunk = text.slice(0, 1200);
  const knownPatterns = [
    /Asian Infrastructure Investment Bank/i,
    /AIIB/i,
    /([A-Z][A-Za-z&.,'\-\s]{2,80})\s+(?:Sustainability|ESG|Annual)\s+Report/,
  ];

  for (const pattern of knownPatterns) {
    const match = firstChunk.match(pattern);
    if (match?.[1]) return cleanCompanyName(match[1]);
    if (match?.[0]) return cleanCompanyName(match[0]);
  }

  return cleanCompanyName(fileName.replace(/\.pdf$/i, "")) || "Uploaded company";
}

function detectReportingYear(text) {
  const match = text.match(/\b(20[1-2][0-9])\b/);
  return match?.[1] ?? "";
}

function evidenceFor(text, pattern) {
  const match = text.match(pattern);
  if (!match?.[0]) return "Metric mentioned in extracted report text; evidence requires analyst review.";
  return truncateEvidence(match[0]);
}

function truncateEvidence(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 150);
}

function cleanCompanyName(value) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(report|sustainability|esg|annual|pdf)\b/gi, "")
    .trim();
}

function addIf(collection, condition, item) {
  if (condition) collection.push(item);
}
