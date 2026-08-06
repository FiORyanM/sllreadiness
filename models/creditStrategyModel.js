import { illustrativeCreditStrategyMarket } from "../data/creditStrategyMarket.js";

export const creditStrategyFrameworkVersion = "climate-capital-credit.v1";

export const capitalWeights = Object.freeze({
  fundingCoverage: 30,
  costEffectiveness: 25,
  timingAlignment: 20,
  sourceCoverage: 15,
  deliveryMrv: 10,
});

export const portfolioWeights = Object.freeze({
  integrity: 30,
  useCaseFit: 20,
  deliveryRisk: 15,
  concentration: 10,
  contractOwnership: 15,
  retirementClaims: 10,
});

const proposedMix = Object.freeze([
  { key: "methane_industrial", share: 60 },
  { key: "nature_removal", share: 25 },
  { key: "durable_removal", share: 15 },
]);

export function buildCreditStrategyAnalysis({
  company = "Company",
  evidenceProfile = {},
  questionnaire = {},
  market = illustrativeCreditStrategyMarket,
  startYear = new Date().getUTCFullYear() + 1,
} = {}) {
  const profile = normalizeProfile(evidenceProfile);
  const answers = normalizeQuestionnaire(questionnaire, startYear);
  const capital = scoreCapitalAllocation(profile);
  const portfolio = scoreCurrentPortfolio(profile.currentPortfolio, answers);
  const action = managementAction(profile, answers, capital, portfolio);
  const priorities = rankInvestmentPriorities(profile.projects, profile);
  const creditSpecification = buildCreditSpecification(action, answers);
  const demand = buildDemand(answers, startYear);
  const scenarios = Object.entries(market.strategies).map(([key, strategy]) =>
    calculateProcurementScenario({ key, strategy, demand, mix: proposedMix, market, answers, startYear }),
  );
  const recommendedScenarioKey = recommendScenario(action, answers, scenarios);
  const recommended = scenarios.find((scenario) => scenario.key === recommendedScenarioKey);
  const wait = scenarios.find((scenario) => scenario.key === "wait_spot");
  scenarios.forEach((scenario) => {
    scenario.potentialNpvSavingVsWaitUsd = wait && scenario.key !== "wait_spot"
      ? Math.round(wait.npvCostUsd - scenario.npvCostUsd)
      : 0;
    scenario.recommended = scenario.key === recommendedScenarioKey;
  });

  return {
    frameworkVersion: creditStrategyFrameworkVersion,
    generatedAt: new Date().toISOString(),
    company,
    market: {
      version: market.version,
      asOfDate: market.asOfDate,
      illustrative: market.illustrative,
      disclaimer: market.disclaimer,
    },
    managementConclusion: {
      action,
      recommendedStrategy: recommended?.label ?? "Wait & Spot",
      reasons: managementReasons(action, capital, answers),
      conditions: managementConditions(action, profile, answers),
    },
    scores: { capitalAllocation: capital, currentPortfolio: portfolio },
    investmentPriorities: priorities.slice(0, 3),
    creditSpecification,
    demand,
    procurementScenarios: scenarios,
    evidenceProfile: profile,
    questionnaire: answers,
    sources: [
      { name: "ICVCM Core Carbon Principles", url: "https://icvcm.org/core-carbon-principles/" },
      { name: "VCMI Claims Code guidance", url: "https://vcmintegrity.org/guides-tutorials/steps-to-making-a-carbon-integrity-claim-2/" },
      { name: "Oxford Principles", url: "https://climate.web.ox.ac.uk/publication/2127012/ora-hyrax" },
    ],
  };
}

export function scoreBand(score) {
  if (!Number.isFinite(score)) return "N/A";
  if (score >= 80) return "Strong";
  if (score >= 65) return "Sound";
  if (score >= 50) return "Needs adjustment";
  return "Weak";
}

function scoreCapitalAllocation(profile) {
  const projects = profile.projects;
  const required = sum(projects.map((project) => project.requiredCapitalUsd));
  const committed = sum(projects.map((project) => project.committedCapitalUsd));
  if (!projects.length || required === null || committed === null) {
    return scoreResult(null, capitalWeights, "Low", ["Project-level required and committed capital are needed."]);
  }
  const fundingCoverage = clamp100(committed / required * 100);
  const validEconomics = projects.filter((project) => project.requiredCapitalUsd > 0 && project.expectedAbatementTco2e > 0);
  const fundedAbatement = sum(validEconomics.map((project) => project.expectedAbatementTco2e * Math.min(1, project.committedCapitalUsd / project.requiredCapitalUsd))) ?? 0;
  const availableAbatement = sum(validEconomics.map((project) => project.expectedAbatementTco2e)) ?? 0;
  const costEffectiveness = availableAbatement ? clamp100(fundedAbatement / availableAbatement * 100) : null;
  const targetYear = profile.target.targetYear;
  const timingAlignment = targetYear
    ? weightedAverage(projects.filter((project) => project.expectedAbatementTco2e), (project) => project.deliveryYear <= targetYear ? 100 : 20, "expectedAbatementTco2e")
    : null;
  const sourceCoverage = clamp100((sum(projects.map((project) => project.sourceCoverage * Math.min(1, project.committedCapitalUsd / project.requiredCapitalUsd))) ?? 0) / Math.max(1, projects.length) * 100);
  const deliveryMrv = average(projects.map((project) => (statusScore(project.status) + (project.mrvReady ? 100 : 40)) / 2));
  const dimensions = {
    fundingCoverage: dimension(fundingCoverage, 30, `${money(committed)} committed against ${money(required)} identified funding need.`),
    costEffectiveness: dimension(costEffectiveness, 25, "Share of identified abatement supported by committed capital."),
    timingAlignment: dimension(timingAlignment, 20, "Expected abatement scheduled on or before the target year."),
    sourceCoverage: dimension(sourceCoverage, 15, "Funded projects mapped to material semiconductor emission sources."),
    deliveryMrv: dimension(deliveryMrv, 10, "Delivery maturity and measurement readiness."),
  };
  const score = weightedAvailable(dimensions, 70);
  const confidence = completenessConfidence(dimensions);
  const drivers = Object.entries(dimensions).map(([key, value]) => ({ key, ...value }));
  return { score, band: scoreBand(score), confidence, dimensions, drivers, highRisk: false };
}

function scoreCurrentPortfolio(portfolio, answers) {
  if (!portfolio.credits.length) {
    return { score: null, band: "N/A — no portfolio to score", confidence: "Low", dimensions: {}, drivers: [], highRisk: false };
  }
  const credits = portfolio.credits;
  const volume = sum(credits.map((credit) => credit.volumeTco2e)) || 1;
  const weighted = (read) => sum(credits.map((credit) => (credit.volumeTco2e || 0) * read(credit))) / volume;
  const integrity = weighted((credit) => average([
    credit.ccpApproved ? 100 : credit.registry && credit.methodology ? 60 : 20,
    credit.additionalityEvidence ? 100 : 30,
    credit.noDoubleCounting ? 100 : 0,
    credit.verified ? 100 : 20,
  ]));
  const useCaseFit = weighted((credit) => credit.type.includes("removal") ? 90 : answers.publicClaimPlanned ? 70 : 60);
  const deliveryRisk = weighted((credit) => credit.deliveryRiskPercent === null ? 50 : clamp100(100 - credit.deliveryRiskPercent * 2));
  const largestShare = Math.max(...credits.map((credit) => (credit.volumeTco2e || 0) / volume * 100));
  const concentration = clamp100(120 - largestShare);
  const contractOwnership = weighted((credit) => average([credit.ownershipConfirmed ? 100 : 20, credit.replacementRemedy ? 100 : 30]));
  const retirementClaims = weighted((credit) => average([credit.retired || !answers.publicClaimPlanned ? 100 : 20, credit.claimBoundaryConfirmed ? 100 : 30]));
  const dimensions = {
    integrity: dimension(integrity, 30, "ICVCM-aligned program, methodology and credit evidence."),
    useCaseFit: dimension(useCaseFit, 20, "Credit type and durability fit the intended use."),
    deliveryRisk: dimension(deliveryRisk, 15, "Delivery and counterparty controls."),
    concentration: dimension(concentration, 10, "Concentration by project and methodology."),
    contractOwnership: dimension(contractOwnership, 15, "Ownership, remedies and replacement terms."),
    retirementClaims: dimension(retirementClaims, 10, "Retirement and claims controls."),
  };
  const highRisk = credits.some((credit) => !credit.noDoubleCounting || (answers.publicClaimPlanned && !credit.ownershipConfirmed) || (credit.claimMade && !credit.retired));
  let score = weightedAvailable(dimensions, 70);
  if (highRisk) score = Math.min(score ?? 49, 49);
  return { score, band: scoreBand(score), confidence: completenessConfidence(dimensions), dimensions, drivers: Object.entries(dimensions).map(([key, value]) => ({ key, ...value })), highRisk };
}

function rankInvestmentPriorities(projects, profile) {
  const targetYear = profile.target.targetYear;
  return projects.map((project) => {
    const capitalDisclosed = project.requiredCapitalUsd !== null && project.committedCapitalUsd !== null;
    const gap = capitalDisclosed ? Math.max(0, project.requiredCapitalUsd - project.committedCapitalUsd) : null;
    const costPerTonne = gap !== null && project.expectedAbatementTco2e > 0 ? gap / project.expectedAbatementTco2e : null;
    const impact = profile.targetGapTco2e > 0 ? clamp100(project.expectedAbatementTco2e / profile.targetGapTco2e * 100) : 50;
    const urgency = targetYear ? clamp100(100 - Math.max(0, project.deliveryYear - targetYear) * 30) : 50;
    const feasibility = statusScore(project.status);
    const costScore = costPerTonne === null ? 50 : clamp100(100 - costPerTonne / 20);
    const priorityScore = Math.round(impact * 0.4 + costScore * 0.25 + urgency * 0.2 + feasibility * 0.15);
    return {
      ...project,
      fundingGapUsd: gap,
      costPerTco2e: costPerTonne,
      priorityScore,
      rationale: `${formatTco2e(project.expectedAbatementTco2e)} potential abatement; ${gap === null ? "project capex not disclosed" : `${money(gap)} remains unfunded`}; delivery ${project.deliveryYear}.`,
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore);
}

function managementAction(profile, answers, capital, portfolio) {
  if (portfolio.highRisk) return "Do not procure yet";
  if (!answers.confirmedBoundary || !answers.demandVolumeTco2e) return answers.useYear ? "Prepare only" : "Do not procure yet";
  const yearsUntilUse = answers.useYear - new Date().getUTCFullYear();
  if (yearsUntilUse <= 1 && answers.demandConfidence === "High" && capital.score >= 50) return "Buy/contract now";
  if (yearsUntilUse <= 3 && ["High", "Medium"].includes(answers.demandConfidence) && capital.score !== null) return "Start sourcing";
  return "Prepare only";
}

function recommendScenario(action, answers) {
  if (action === "Buy/contract now" && answers.riskAppetite === "high") return "secure_early";
  if (["Buy/contract now", "Start sourcing"].includes(action)) return "staged";
  return "wait_spot";
}

function buildCreditSpecification(action, answers) {
  return {
    useCase: answers.publicClaimPlanned ? "Potential voluntary carbon-integrity claim, subject to eligibility and assurance" : "Beyond-value-chain contribution / future supply preparation",
    qualityThreshold: "CCP-Approved credits where available; otherwise full CCP-equivalent project due diligence.",
    types: ["High-integrity reductions for a near-term bridge", "Nature removals", "Early durable-removal tranche"],
    durability: "Increase removals and durable storage toward the net-zero use year; do not apply a fixed industry percentage.",
    deliveryWindow: `${answers.useYear}-${answers.useYear + 2}`,
    registryMethodology: "Named registry, methodology, vintage, serial tracking, independent verification and no-double-counting evidence required.",
    procurementForm: action === "Start sourcing" ? "Staged forward contracts with delivery remedies; retain a spot tranche." : action === "Buy/contract now" ? "Forward / offtake plus a limited spot tranche." : "No purchase commitment; prepare an approved sourcing specification.",
    retirementControls: "Retire credits for the relevant reporting period before making a compensation claim; preserve ownership and assurance evidence.",
    exclusions: ["Unspecified registry or methodology", "No ownership or replacement remedy", "Double-counting concern", "Credits used to substitute internal reduction"],
    proposedMix,
  };
}

function buildDemand(answers, startYear) {
  const volume = answers.demandVolumeTco2e || 0;
  return {
    basis: answers.publicClaimPlanned ? "Confirmed planning volume for a potential voluntary claim" : "Confirmed planning volume for contribution or future supply",
    confidence: answers.demandConfidence,
    years: [0, 1, 2].map((offset) => ({ year: Number(startYear) + offset, volumeTco2e: volume })),
  };
}

export function calculateProcurementScenario({ key, strategy, demand, mix, market, answers, startYear }) {
  const discountRate = answers.costOfCapitalPercent / 100;
  const currentYear = new Date().getUTCFullYear();
  const cashflows = new Map();
  let nominalCostUsd = 0;
  let securedVolumeTco2e = 0;
  let deliveryAtRiskTco2e = 0;
  let replacementCostExposureUsd = 0;
  let totalVolumeTco2e = 0;

  for (const demandYear of demand.years) {
    for (const mixItem of mix) {
      const category = market.categories[mixItem.key];
      const volume = demandYear.volumeTco2e * mixItem.share / 100;
      const years = Math.max(0, demandYear.year - Number(startYear));
      const spotPrice = category.basePrice * (1 + category.annualEscalation) ** years;
      const nowVolume = volume * strategy.contractedNow;
      const priorVolume = volume * strategy.contractedOneYearPrior;
      const spotVolume = volume * strategy.spotAtDelivery;
      const contractPrice = spotPrice * (1 - strategy.contractDiscount);
      const expectedReplacement = (nowVolume + priorVolume) * strategy.deliveryFailureRisk * spotPrice * (1 + market.replacementPremium);
      const contractedCost = (nowVolume + priorVolume) * contractPrice;
      const spotCost = spotVolume * spotPrice;
      const total = contractedCost + spotCost + expectedReplacement;
      totalVolumeTco2e += volume;
      nominalCostUsd += total;
      securedVolumeTco2e += nowVolume + priorVolume;
      deliveryAtRiskTco2e += (nowVolume + priorVolume) * strategy.deliveryFailureRisk;
      replacementCostExposureUsd += expectedReplacement;

      addCashflow(cashflows, currentYear, nowVolume * contractPrice * strategy.depositShare);
      if (strategy.milestoneShare) addCashflow(cashflows, Math.max(currentYear, demandYear.year - 1), nowVolume * contractPrice * strategy.milestoneShare);
      addCashflow(cashflows, demandYear.year, nowVolume * contractPrice * (1 - strategy.depositShare - strategy.milestoneShare));
      const priorContractYear = Math.max(currentYear, demandYear.year - 1);
      addCashflow(cashflows, priorContractYear, priorVolume * contractPrice * strategy.depositShare);
      addCashflow(cashflows, demandYear.year, priorVolume * contractPrice * (1 - strategy.depositShare) + spotCost + expectedReplacement);
    }
  }
  const annualCashflows = [...cashflows.entries()].sort(([a], [b]) => a - b).map(([year, amountUsd]) => ({ year, amountUsd: Math.round(amountUsd) }));
  const npvCostUsd = annualCashflows.reduce((total, item) => total + item.amountUsd / (1 + discountRate) ** Math.max(0, item.year - currentYear), 0);
  return {
    key,
    label: strategy.label,
    nominalCostUsd: Math.round(nominalCostUsd),
    npvCostUsd: Math.round(npvCostUsd),
    weightedAverageUsdPerTco2e: totalVolumeTco2e ? nominalCostUsd / totalVolumeTco2e : 0,
    securedVolumeTco2e: Math.round(securedVolumeTco2e),
    deliveryAtRiskTco2e: Math.round(deliveryAtRiskTco2e),
    replacementCostExposureUsd: Math.round(replacementCostExposureUsd),
    totalDemandTco2e: Math.round(totalVolumeTco2e),
    annualCashflows,
    recommended: false,
  };
}

function normalizeProfile(value) {
  const emissions = value.emissions ?? {};
  const target = value.target ?? {};
  const boundary = number(emissions.targetBoundaryTco2e) ?? sum([number(emissions.scope1Tco2e), number(emissions.scope2Tco2e)]);
  const targetEmissions = number(target.targetEmissionsTco2e) ?? (boundary !== null && number(target.reductionPercent) !== null ? boundary * (1 - number(target.reductionPercent) / 100) : null);
  return {
    sector: value.sector ?? "semiconductors",
    emissions: { ...emissions, targetBoundaryTco2e: boundary },
    target: { ...target, targetEmissionsTco2e: targetEmissions },
    targetGapTco2e: boundary !== null && targetEmissions !== null ? Math.max(0, boundary - targetEmissions) : null,
    projects: (value.projects ?? value.internalInvestments ?? []).map(normalizeProject),
    currentPortfolio: normalizePortfolio(value.currentPortfolio ?? value.carbonCredits),
  };
}

function normalizeProject(value) {
  return {
    name: String(value.name ?? "Decarbonization project"),
    lever: value.lever ?? value.category ?? "other",
    requiredCapitalUsd: number(value.requiredCapitalUsd ?? value.amountUsd),
    committedCapitalUsd: number(value.committedCapitalUsd ?? value.amountUsd),
    expectedAbatementTco2e: number(value.expectedAbatementTco2e),
    deliveryYear: integer(value.deliveryYear),
    status: value.status ?? "not_disclosed",
    mrvReady: Boolean(value.mrvReady ?? value.verified),
    sourceCoverage: number(value.sourceCoverage) ?? 0.5,
    citations: sanitizeCitations(value.citations),
  };
}

function normalizePortfolio(value = {}) {
  const supplied = Array.isArray(value.credits) ? value.credits : [];
  return {
    disclosureStatus: value.disclosureStatus ?? (supplied.length ? "disclosed" : "not_disclosed"),
    credits: supplied.map((credit) => ({
      ...credit,
      volumeTco2e: number(credit.volumeTco2e) ?? 0,
      deliveryRiskPercent: number(credit.deliveryRiskPercent),
      registry: String(credit.registry ?? ""),
      methodology: String(credit.methodology ?? ""),
      type: String(credit.type ?? "other"),
    })),
    citations: sanitizeCitations(value.citations),
  };
}

function normalizeQuestionnaire(value, startYear) {
  return {
    confirmedBoundary: Boolean(value.confirmedBoundary),
    publicClaimPlanned: Boolean(value.publicClaimPlanned),
    useYear: integer(value.useYear) ?? Number(startYear) + 1,
    annualBudgetUsd: number(value.annualBudgetUsd),
    riskAppetite: ["low", "balanced", "high"].includes(value.riskAppetite) ? value.riskAppetite : "balanced",
    maxUpfrontPercent: number(value.maxUpfrontPercent) ?? 30,
    costOfCapitalPercent: number(value.costOfCapitalPercent) ?? 8,
    demandVolumeTco2e: number(value.demandVolumeTco2e),
    demandConfidence: ["High", "Medium", "Low"].includes(value.demandConfidence) ? value.demandConfidence : "Low",
  };
}

function managementReasons(action, capital, answers) {
  if (action === "Start sourcing") return [
    `A ${answers.demandConfidence.toLowerCase()}-confidence use case is expected within three years.`,
    `Capital allocation is ${capital.band.toLowerCase()}; staged sourcing preserves flexibility while internal projects mature.`,
  ];
  if (action === "Buy/contract now") return ["The use year is near and demand is confirmed.", "A staged or early contract can secure eligible supply before retirement."];
  if (action === "Do not procure yet") return ["A defensible demand boundary or integrity control is missing.", "Purchasing now could create claims or substitution risk."];
  return ["Future demand is plausible but not sufficiently confirmed.", "Prepare the specification and approvals before committing capital."];
}

function managementConditions(action, profile, answers) {
  const conditions = [];
  if (!answers.confirmedBoundary) conditions.push("Confirm the emissions and claim boundary.");
  if (!answers.demandVolumeTco2e) conditions.push("Quantify the annual planning volume.");
  if (profile.projects.some((project) => project.requiredCapitalUsd === null || project.expectedAbatementTco2e === null)) conditions.push("Complete project capex and abatement ranges.");
  if (action !== "Do not procure yet") conditions.push("Complete project-level CCP and contract due diligence before signing.");
  return conditions.slice(0, 3);
}

function scoreResult(score, weights, confidence, reasons) {
  return { score, band: scoreBand(score), confidence, dimensions: Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, dimension(null, weight, reasons[0])])), drivers: [], highRisk: false };
}

function dimension(score, weight, explanation) {
  return { score: Number.isFinite(score) ? Math.round(clamp100(score)) : null, weight, explanation };
}

function weightedAvailable(dimensions, minimumWeight) {
  const available = Object.values(dimensions).filter((item) => item.score !== null);
  const weight = sum(available.map((item) => item.weight)) ?? 0;
  if (weight < minimumWeight) return null;
  return Math.round(sum(available.map((item) => item.score * item.weight)) / weight);
}

function completenessConfidence(dimensions) {
  const available = Object.values(dimensions).filter((item) => item.score !== null).reduce((sumValue, item) => sumValue + item.weight, 0);
  return available >= 90 ? "High" : available >= 70 ? "Medium" : "Low";
}

function statusScore(status) {
  if (/complete|operational/i.test(status)) return 100;
  if (/underway|implement/i.test(status)) return 80;
  if (/approved|contract/i.test(status)) return 60;
  if (/planned|proposed/i.test(status)) return 35;
  return 20;
}

function weightedAverage(items, read, weightKey) {
  const denominator = sum(items.map((item) => number(item[weightKey]))) ?? 0;
  if (!denominator) return null;
  return sum(items.map((item) => read(item) * number(item[weightKey]))) / denominator;
}

function addCashflow(map, year, value) {
  map.set(year, (map.get(year) ?? 0) + value);
}

function sanitizeCitations(items = []) {
  return items.filter((item) => item?.quote && Array.isArray(item.pages) && item.pages.length).map((item) => ({ quote: String(item.quote), pages: item.pages.map(Number).filter(Number.isInteger) }));
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value) {
  const parsed = number(value);
  return parsed === null ? null : Math.round(parsed);
}

function sum(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((total, value) => total + value, 0) : null;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((total, value) => total + value, 0) / clean.length : null;
}

function clamp100(value) {
  return Math.max(0, Math.min(100, value));
}

function money(value) {
  if (!Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatTco2e(value) {
  return `${Math.round(value ?? 0).toLocaleString("en-US")} tCO2e`;
}
