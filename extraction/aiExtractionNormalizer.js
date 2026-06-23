import { sllComponentKeys } from "./sllExtractionSchema.js";

export const genericDealDefaults = Object.freeze({
  loanSizeM: 500,
  tenor: 5,
  baseMargin: 150,
  ratchetBest: 10,
  ratchetWorst: 5,
});

const componentLabels = {
  kpiDataHistory: "KPI data history",
  kpiMethodology: "KPI methodology",
  reportingInfrastructure: "Reporting infrastructure",
  externalVerification: "External verification",
  strategicAlignment: "Strategic alignment",
};

/**
 * Makes an AI merge safe to use in the report.  The providers sometimes emit
 * contract-shaped placeholder values (notably zero-valued deal inputs and
 * zero scores with a "High" status), so shape validation alone is not enough.
 */
export function normalizeAiExtraction(extraction, { evidences = [], metadata } = {}) {
  const citations = citationsFromEvidence(evidences);
  const originalComponents = extraction?.modelInputs?.componentsByKey ?? {};
  const componentsByKey = normalizeComponents(originalComponents, citations);
  const citedComponentCount = Object.values(componentsByKey).filter((component) => component.citations.length > 0).length;

  return {
    ...extraction,
    dealDefaults: normalizeDealDefaults(extraction?.dealDefaults),
    modelInputs: {
      ...extraction.modelInputs,
      recommendedKpiCount: normalizeKpiCount(extraction?.modelInputs?.recommendedKpiCount, extraction?.analysis?.kpis),
      assessmentState: citedComponentCount === sllComponentKeys.length ? "assessed" : "insufficient_evidence",
      citedComponentCount,
      componentsByKey,
    },
    analysis: {
      ...extraction.analysis,
      kpis: normalizeKpis(extraction?.analysis?.kpis ?? [], citations),
      gaps: normalizeGaps(extraction?.analysis?.gaps ?? [], citations),
      baseMarginNote:
        extraction?.analysis?.baseMarginNote ||
        "Illustrative 150bps base margin and 500m / 5-year facility assumptions are shown because no loan facility was identified in the report. Replace them with the proposed facility terms.",
    },
  };
}

function normalizeDealDefaults(values = {}) {
  return {
    loanSizeM: positiveNumber(values.loanSizeM, genericDealDefaults.loanSizeM),
    tenor: positiveNumber(values.tenor, genericDealDefaults.tenor),
    baseMargin: positiveNumber(values.baseMargin, genericDealDefaults.baseMargin),
    ratchetBest: positiveNumber(values.ratchetBest, genericDealDefaults.ratchetBest),
    ratchetWorst: positiveNumber(values.ratchetWorst, genericDealDefaults.ratchetWorst),
  };
}

function normalizeKpiCount(value, kpis = []) {
  if (Number.isInteger(value) && value > 0) return Math.min(value, 4);
  return Math.max(1, Math.min(kpis.filter((kpi) => kpi.status === "Ready").length, 2));
}

function normalizeComponents(components, citations) {
  return Object.fromEntries(
    sllComponentKeys.map((key) => {
      const original = components[key] ?? {};
      const componentCitations = sanitizeCitations(original.citations).length
        ? sanitizeCitations(original.citations)
        : citationsForComponent(key, citations);
      const score = numericScore(original.score);
      const hasCitedScore = score !== null && score > 0 && componentCitations.length > 0;
      return [key, {
        ...original,
        name: componentLabels[key],
        score: hasCitedScore ? score : null,
        maturity: hasCitedScore ? maturityForScore(score) : "absent",
        status: hasCitedScore ? statusForScore(score) : "Insufficient evidence",
        citations: componentCitations,
      }];
    }),
  );
}

function normalizeKpis(kpis, citations) {
  return kpis.map((kpi) => {
    const kpiCitations = sanitizeCitations(kpi.citations).length ? sanitizeCitations(kpi.citations) : citationsForKpi(kpi, citations);
    if (kpiCitations.length > 0) return { ...kpi, citations: kpiCitations };
    return {
      ...kpi,
      evidence: "Insufficient cited evidence to assess this KPI candidate.",
      status: "Insufficient evidence",
      confidence: "low",
      citations: [],
    };
  });
}

function normalizeGaps(gaps, citations) {
  return gaps.flatMap((gap) => {
    // Lack of SLL wording is not a deficiency in a general ESG report.
    if (/sll[-\s]?specific documentation|sustainability[-\s]?linked loan principles/i.test(gap?.title ?? "")) return [];
    const gapCitations = sanitizeCitations(gap.citations).length ? sanitizeCitations(gap.citations) : citationsForGap(gap, citations);
    return gapCitations.length > 0 ? [{ ...gap, citations: gapCitations }] : [];
  });
}

function citationsFromEvidence(evidences) {
  return evidences
    .flatMap((item) => item?.evidence ?? [])
    .filter((item) => item?.sourceQuote && validPages(item.pageNumbers))
    .map((item) => ({
      topic: String(item.topic ?? "").toLowerCase(),
      finding: String(item.finding ?? ""),
      quote: item.sourceQuote.trim(),
      pages: [...new Set(item.pageNumbers)].sort((a, b) => a - b),
    }));
}

function citationsForComponent(key, citations) {
  const topicsByComponent = {
    kpiDataHistory: ["kpi", "target"],
    kpiMethodology: ["methodology", "kpi"],
    reportingInfrastructure: ["reporting"],
    externalVerification: ["verification"],
    strategicAlignment: ["strategy", "target"],
  };
  return citations.filter((citation) => topicsByComponent[key].some((topic) => citation.topic.includes(topic))).slice(0, 2).map(publicCitation);
}

function citationsForKpi(kpi, citations) {
  const keywords = `${kpi?.name ?? ""} ${kpi?.evidence ?? ""}`.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const matching = citations.filter((citation) => citation.topic.includes("kpi") || citation.topic.includes("target"))
    .filter((citation) => keywords.some((word) => word.length >= 4 && `${citation.finding} ${citation.quote}`.toLowerCase().includes(word)));
  return (matching.length ? matching : citations.filter((citation) => citation.topic.includes("kpi") || citation.topic.includes("target"))).slice(0, 2).map(publicCitation);
}

function citationsForGap(gap, citations) {
  const keywords = `${gap?.title ?? ""} ${gap?.description ?? ""}`.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return citations
    .filter((citation) => citation.topic.includes("gap"))
    .filter((citation) => keywords.some((word) => word.length >= 4 && `${citation.finding} ${citation.quote}`.toLowerCase().includes(word)))
    .slice(0, 2)
    .map(publicCitation);
}

function publicCitation(citation) {
  return { quote: citation.quote, pages: citation.pages };
}

function sanitizeCitations(citations) {
  return (citations ?? [])
    .filter((citation) => citation?.quote && validPages(citation.pages))
    .slice(0, 2)
    .map((citation) => ({ quote: String(citation.quote).trim(), pages: [...new Set(citation.pages)].sort((a, b) => a - b) }));
}

function validPages(pages) {
  return Array.isArray(pages) && pages.length > 0 && pages.every((page) => Number.isInteger(page) && page > 0);
}

function positiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function numericScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.min(100, Math.max(0, value)));
}

function maturityForScore(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "absent";
}

function statusForScore(score) {
  if (score >= 75) return "High";
  if (score >= 50) return "Partial";
  return "Gap";
}
