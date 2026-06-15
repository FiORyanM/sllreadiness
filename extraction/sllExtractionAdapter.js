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
  const sllpAlignment = buildSllpAlignment(signals);
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
      sllpAlignment,
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
  const hasBaseline = /baseline|base year|reference year|reference point|base period/.test(normalized);
  const hasTargets = /target|spt|sustainability performance target|net zero|paris aligned|science based/.test(normalized);
  const hasAnnualSpt =
    /annual[^.]{0,80}(target|spt|observation)|year[-\s]?on[-\s]?year|each year|target observation/.test(normalized);
  const hasObservationDate = /observation date|target date|target year|by 20[2-5][0-9]|interim target/.test(normalized);
  const hasMethodology = /methodolog|baseline|calculation|ghg protocol|pcaf|iso 14064|scope 1|scope 2/.test(normalized);
  const hasScopeDefinition = /scope 1|scope 2|scope 3|operational boundary|organizational boundary|coverage|parameter/.test(normalized);
  const hasBenchmark =
    /benchmark|peer|industry average|sector|best[-\s]?in[-\s]?class|science[-\s]?based|paris agreement|net zero|sdg|ndc/.test(
      normalized,
    );
  const hasReporting = /sustainability report|annual report|tcfd|ifrs s|gri|sasb|issb|data governance/.test(normalized);
  const hasAnnualReporting = /annual report|annually|at least annually|sustainability report|integrated annual report/.test(normalized);
  const hasLenderReporting = /lender|loan|sustainability[-\s]?linked|sll|facility|margin|ratchet/.test(normalized);
  const hasVerification = /assur|verified|verification|third[-\s]?party|external review|limited assurance|reasonable assurance/.test(
    normalized,
  );
  const hasQualifiedVerifier = /auditor|assurance provider|qualified external reviewer|independent|third[-\s]?party|ratings agency/.test(
    normalized,
  );
  const hasStrategy = /strategy|transition plan|climate action|sustainable finance|sustainability framework|governance/.test(
    normalized,
  );
  const hasMateriality = /materiality|material topic|material issue|core business|strategic significance|material to/.test(normalized);
  const hasAmbition =
    /ambitious|beyond business as usual|business[-\s]?as[-\s]?usual|regulatory|science[-\s]?based|paris aligned|net zero/.test(
      normalized,
    );
  const hasScope3Gap = /scope 3/.test(normalized) && /excluded|partial|not included|limited|coverage/.test(normalized);

  return {
    hasThreeYearHistory,
    hasBaseline,
    hasTargets,
    hasAnnualSpt,
    hasObservationDate,
    hasMethodology,
    hasScopeDefinition,
    hasBenchmark,
    hasReporting,
    hasAnnualReporting,
    hasLenderReporting,
    hasVerification,
    hasQualifiedVerifier,
    hasStrategy,
    hasMateriality,
    hasAmbition,
    hasScope3Gap,
    lowConfidence: normalized.length < 3000,
  };
}

function buildComponentInputs(signals) {
  return {
    kpiDataHistory: component("kpiDataHistory", scoreFromChecks([signals.hasThreeYearHistory, signals.hasBaseline], 30)),
    kpiMethodology: component(
      "kpiMethodology",
      scoreFromChecks([signals.hasMethodology, signals.hasScopeDefinition, signals.hasBenchmark, signals.hasTargets], 25),
    ),
    reportingInfrastructure: component(
      "reportingInfrastructure",
      scoreFromChecks([signals.hasReporting, signals.hasAnnualReporting, signals.hasLenderReporting], 34),
    ),
    externalVerification: component(
      "externalVerification",
      scoreFromChecks([signals.hasVerification, signals.hasQualifiedVerifier], 30),
    ),
    strategicAlignment: component(
      "strategicAlignment",
      scoreFromChecks([signals.hasStrategy, signals.hasMateriality, signals.hasAmbition], 28),
    ),
  };
}

function scoreFromChecks(checks, absentScore) {
  const hitCount = checks.filter(Boolean).length;
  const score = absentScore + Math.round((hitCount / checks.length) * (92 - absentScore));
  return Math.min(score, 92);
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
    status: sllReadyStatus(normalized, "finance"),
    confidence: "medium",
  });

  addIf(candidates, /ghg|greenhouse gas|scope 1|scope 2|emissions/.test(normalized), {
    name: "GHG emissions intensity",
    evidence: evidenceFor(text, /(ghg|greenhouse gas|scope 1|scope 2|emissions)[^.]{0,140}/i),
    status: sllReadyStatus(normalized, "emissions"),
    confidence: "medium",
  });

  addIf(candidates, /renewable energy|electricity|energy consumption/.test(normalized), {
    name: "Renewable energy share",
    evidence: evidenceFor(text, /(renewable energy|electricity|energy consumption)[^.]{0,140}/i),
    status: sllReadyStatus(normalized, "energy"),
    confidence: "medium",
  });

  addIf(candidates, /paris aligned|transition|net zero|science based/.test(normalized), {
    name: "Paris-aligned transition progress",
    evidence: evidenceFor(text, /(paris aligned|transition|net zero|science based)[^.]{0,140}/i),
    status: sllReadyStatus(normalized, "transition"),
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

function sllReadyStatus(normalized, type) {
  const hasMethodology = /methodolog|baseline|calculation|ghg protocol|pcaf|iso 14064/.test(normalized);
  const hasVerification = /assur|verified|verification|third[-\s]?party|limited assurance|reasonable assurance/.test(normalized);
  const hasTarget = /target|spt|net zero|paris aligned|science based/.test(normalized);
  const hasHistory = /\b(three|3)[-\s]?year\b/.test(normalized);
  const hasTypeBenchmark =
    type === "transition" || /benchmark|peer|industry|sector|science[-\s]?based|paris agreement|net zero/.test(normalized);

  if (hasMethodology && hasVerification && hasTarget && (hasHistory || hasTypeBenchmark)) return "Ready";
  return "Partial";
}

function buildSllpAlignment(signals) {
  return {
    standard: "Sustainability-Linked Loan Principles, 26 March 2025",
    coreComponents: {
      selectionOfKpis: evidenceState(
        signals.hasMateriality && signals.hasMethodology,
        "KPI materiality, definition and measurability signals detected.",
        "KPI materiality and definition need analyst confirmation.",
      ),
      calibrationOfSpts: evidenceState(
        signals.hasTargets && signals.hasAmbition && signals.hasObservationDate,
        "Targets, ambition signals and target timing detected.",
        "SPT ambition, observation dates or benchmark rationale are not clearly evidenced.",
      ),
      loanCharacteristics: evidenceState(
        signals.hasLenderReporting,
        "Loan or lender-linked performance adjustment language detected.",
        "Loan characteristic linkage is not clear from the ESG report alone.",
      ),
      reporting: evidenceState(
        signals.hasAnnualReporting,
        "Annual sustainability or integrated reporting infrastructure detected.",
        "Annual lender-ready KPI/SPT reporting needs confirmation.",
      ),
      verification: evidenceState(
        signals.hasVerification && signals.hasQualifiedVerifier,
        "Independent assurance or qualified external review signals detected.",
        "Independent external verification against SPTs is not clearly evidenced.",
      ),
    },
  };
}

function evidenceState(ok, positive, negative) {
  return {
    status: ok ? "Detected" : "Needs review",
    note: ok ? positive : negative,
  };
}

function detectGaps(signals, kpis) {
  const gaps = [];

  if (!signals.hasVerification) {
    gaps.push({
      title: "SLLP verification requirement not clearly evidenced",
      description:
        "Post-signing independent external verification against each KPI/SPT is a necessary SLLP element. Confirm assurance scope and verifier credentials before lender outreach.",
      severity: "High",
    });
  }

  if (!signals.hasThreeYearHistory) {
    gaps.push({
      title: "KPI track record may be insufficient",
      description: "SLLP recommends a minimum of three years of measurement track record where feasible for selected KPIs.",
      severity: "Medium",
    });
  }

  if (!signals.hasBaseline || !signals.hasMethodology) {
    gaps.push({
      title: "KPI baseline or calculation methodology needs confirmation",
      description:
        "Define KPI scope, baseline/reference point and calculation methodology before treating disclosed metrics as SLL-ready KPIs.",
      severity: "Medium",
    });
  }

  if (!signals.hasBenchmark || !signals.hasAmbition) {
    gaps.push({
      title: "SPT ambition evidence is not yet lender-ready",
      description:
        "Calibrate SPTs beyond business-as-usual and regulatory requirements using own history, peer/sector benchmarks or science-based references.",
      severity: "Medium",
    });
  }

  if (!signals.hasAnnualSpt || !signals.hasObservationDate) {
    gaps.push({
      title: "Annual SPT schedule not clearly detected",
      description:
        "SLLP 2025 expects annual SPTs per KPI for each year of the loan term unless a strong rationale supports an exception.",
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
      description: "Convert disclosed ESG metrics into material, ambitious, benchmarkable SPTs with annual observation dates.",
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
