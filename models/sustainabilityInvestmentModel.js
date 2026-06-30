export const sustainabilityInvestmentFrameworkVersion = "sustainability-investment-framework.v1";

export const sustainabilityInvestmentCriteria = [
  { key: "useOfProceedsClarity", label: "Use-of-proceeds clarity", weight: 20 },
  { key: "decarbonizationLink", label: "Decarbonization link", weight: 20 },
  { key: "quantification", label: "Quantified amount or impact", weight: 15 },
  { key: "deliveryStatus", label: "Delivery status", weight: 15 },
  { key: "verification", label: "Verification readiness", weight: 15 },
  { key: "carbonCreditFit", label: "Carbon credit pathway", weight: 15 },
];

const directSupplyCategories = new Set(["nature_based", "carbon_removal", "waste_methane"]);
const transitionCategories = new Set([
  "renewable_energy",
  "energy_efficiency",
  "clean_transport",
  "green_buildings",
  "supplier_decarbonization",
  "sustainable_finance",
]);

export function normalizeSustainabilityInvestmentAnalysis(rawAnalysis = {}, evidenceCitations = []) {
  rawAnalysis = rawAnalysis ?? {};
  const suppliedItems = Array.isArray(rawAnalysis.items)
    ? rawAnalysis.items
    : Array.isArray(rawAnalysis)
      ? rawAnalysis
      : [];
  const investmentEvidence = investmentCitations(evidenceCitations);
  const sourceItems = suppliedItems.length ? suppliedItems : itemsFromEvidence(investmentEvidence);
  const items = sourceItems
    .map((item) => normalizeInvestmentItem(item, investmentEvidence))
    .filter((item) => item.citations.length > 0)
    .slice(0, 6);
  const opportunityScore = scoreOpportunity(items);

  return {
    frameworkVersion: sustainabilityInvestmentFrameworkVersion,
    summary: rawAnalysis.summary || summaryForItems(items),
    overallRating: ratingForScore(opportunityScore),
    carbonCreditOpportunityScore: opportunityScore,
    carbonCreditThesis: rawAnalysis.carbonCreditThesis || thesisForItems(items),
    qualityCriteria: sustainabilityInvestmentCriteria,
    items,
  };
}

function normalizeInvestmentItem(item, evidenceCitations) {
  const citations = sanitizeCitations(item.citations).length
    ? sanitizeCitations(item.citations)
    : citationsForInvestment(item, evidenceCitations);
  const category = normalizeCategory(item.category ?? item.targetArea ?? item.name);
  const score = numericScore(item.score) ?? scoreInvestment({ ...item, category, citations });

  return {
    name: String(item.name || item.finding || "Sustainability investment").trim(),
    category,
    investmentType: String(item.investmentType || item.type || "Not specified").trim(),
    amount: String(item.amount || item.capex || "Not disclosed").trim(),
    targetArea: String(item.targetArea || item.expectedImpact || item.finding || "Not specified").trim(),
    expectedImpact: String(item.expectedImpact || item.assessment || "Impact not quantified in cited evidence.").trim(),
    rating: ratingForScore(score),
    score,
    carbonCreditRelevance: carbonCreditRelevance(category, item.carbonCreditRelevance),
    carbonCreditPathway: item.carbonCreditPathway || carbonCreditPathway(category),
    assessment: item.assessment || assessmentForScore(score),
    citations,
  };
}

function scoreInvestment(item) {
  const text = `${item.name ?? ""} ${item.category ?? ""} ${item.investmentType ?? ""} ${item.amount ?? ""} ${item.targetArea ?? ""} ${item.expectedImpact ?? ""} ${item.assessment ?? ""}`.toLowerCase();
  let score = 0;
  if (item.name && item.category !== "other") score += 20;
  if (/(decarbon|emission|renewable|energy|efficien|electric|methane|carbon|net zero|transition)/i.test(text)) score += 20;
  if (item.amount !== "Not disclosed" || /\b(\d+(?:\.\d+)?\s?(%|tco2e|mw|mwh|gwh|usd|hk\$|\$|million|billion))\b/i.test(text)) score += 15;
  if (/(completed|underway|ongoing|pipeline|launched|implemented|committed|approved)/i.test(text)) score += 15;
  if (/(verified|assured|certified|external|third-party|audit|registry|standard)/i.test(text)) score += 15;
  if (carbonCreditRelevance(item.category, item.carbonCreditRelevance) !== "Low") score += 15;
  return Math.max(10, Math.min(100, score));
}

function scoreOpportunity(items) {
  if (!items.length) return 0;
  const average = Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);
  const directBonus = items.some((item) => item.carbonCreditRelevance === "High") ? 8 : 0;
  return Math.min(100, average + directBonus);
}

function ratingForScore(score) {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Credible";
  if (score >= 40) return "Emerging";
  if (score > 0) return "Weak";
  return "No cited investment evidence";
}

function assessmentForScore(score) {
  if (score >= 80) return "Well supported sustainability investment; suitable for carbon credit diligence or target-achievement planning.";
  if (score >= 60) return "Commercially useful investment signal, but impact quantification or verification should be tightened.";
  if (score >= 40) return "Early investment signal; needs clearer amount, impact and delivery evidence before carbon credit positioning.";
  return "Mentioned investment is too thinly evidenced for a positive carbon credit view.";
}

function carbonCreditRelevance(category, supplied) {
  if (["High", "Medium", "Low"].includes(supplied)) return supplied;
  if (directSupplyCategories.has(category)) return "High";
  if (transitionCategories.has(category)) return "Medium";
  return "Low";
}

function carbonCreditPathway(category) {
  if (directSupplyCategories.has(category)) {
    return "Potential credit supply candidate; requires registry methodology, additionality, permanence and ownership review.";
  }
  if (transitionCategories.has(category)) {
    return "Internal reduction lever; use to estimate residual emissions and the volume of high-quality credits needed for target-achievement risk.";
  }
  return "No clear carbon credit pathway from the cited investment alone.";
}

function summaryForItems(items) {
  if (!items.length) return "No cited sustainability investment was detected, so no investment rating was assigned.";
  const strongCount = items.filter((item) => item.rating === "Strong" || item.rating === "Credible").length;
  return `${items.length} cited sustainability investment signal${items.length === 1 ? "" : "s"} detected; ${strongCount} are rated Credible or Strong.`;
}

function thesisForItems(items) {
  if (!items.length) {
    return "Ask for project-level capex, expected emissions impact and any existing offset/credit strategy before discussing carbon credit transactions.";
  }
  if (items.some((item) => item.carbonCreditRelevance === "High")) {
    return "Prioritize carbon credit eligibility diligence for high-relevance investments, then map residual emissions demand after internal reductions.";
  }
  return "Treat the investments primarily as internal decarbonization levers; carbon credits should cover residual or hard-to-abate emissions, not replace these actions.";
}

function itemsFromEvidence(citations) {
  return citations.map((citation) => ({
    name: citation.finding || "Sustainability investment",
    category: normalizeCategory(`${citation.finding} ${citation.quote}`),
    expectedImpact: citation.finding,
    citations: [publicCitation(citation)],
  }));
}

function investmentCitations(citations) {
  return citations.filter((citation) =>
    /(investment|capex|capital expenditure|project|fund|renewable|energy|efficiency|carbon credit|offset|removal|methane|green building|clean transport)/i.test(
      `${citation.topic} ${citation.finding} ${citation.quote}`,
    ),
  );
}

function citationsForInvestment(item, citations) {
  const keywords = `${item?.name ?? ""} ${item?.targetArea ?? ""} ${item?.expectedImpact ?? ""}`
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
  const matching = citations.filter((citation) =>
    keywords.some((word) => word.length >= 4 && `${citation.finding} ${citation.quote}`.toLowerCase().includes(word)),
  );
  return (matching.length ? matching : citations).slice(0, 2).map(publicCitation);
}

function normalizeCategory(value) {
  const text = String(value ?? "").toLowerCase();
  if (/nature|forest|mangrove|reforestation|afforestation/.test(text)) return "nature_based";
  if (/removal|direct air|dac|biochar|ccus|carbon capture/.test(text)) return "carbon_removal";
  if (/methane|landfill|biogas/.test(text)) return "waste_methane";
  if (/renewable|solar|wind|ppa|electricity/.test(text)) return "renewable_energy";
  if (/efficien|energy saving/.test(text)) return "energy_efficiency";
  if (/transport|vehicle|fleet|ev|electric vehicle/.test(text)) return "clean_transport";
  if (/building|leed|green building/.test(text)) return "green_buildings";
  if (/supplier|scope 3|value chain/.test(text)) return "supplier_decarbonization";
  if (/finance|loan|bond|fund/.test(text)) return "sustainable_finance";
  if (/water/.test(text)) return "water";
  if (/waste|recycling|circular/.test(text)) return "circularity";
  return "other";
}

function numericScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.min(100, Math.max(0, value)));
}

function sanitizeCitations(citations) {
  return (citations ?? [])
    .filter((citation) => citation?.quote && validPages(citation.pages))
    .slice(0, 2)
    .map((citation) => ({ quote: String(citation.quote).trim(), pages: [...new Set(citation.pages)].sort((a, b) => a - b) }));
}

function publicCitation(citation) {
  return { quote: citation.quote, pages: citation.pages };
}

function validPages(pages) {
  return Array.isArray(pages) && pages.length > 0 && pages.every((page) => Number.isInteger(page) && page > 0);
}
