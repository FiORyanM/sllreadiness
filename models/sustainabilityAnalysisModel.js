import { sustainabilityBenchmarkData } from "../data/sustainabilityBenchmarks.js";

export const sustainabilityAnalysisFrameworkVersion = "sustainability-deep-analysis.v1";

export const internalInvestmentWeights = Object.freeze({
  targetGapCoverage: 35,
  capitalCommitment: 20,
  materialityAlignment: 20,
  deliveryStatus: 15,
  governanceVerification: 10,
});

export const carbonPortfolioWeights = Object.freeze({
  volumeCoverage: 30,
  creditIntegrity: 30,
  clientSectorFit: 15,
  removalTrajectory: 15,
  procurementClaims: 10,
});

const categoryFitFactors = Object.freeze({ Prefer: 1.25, Neutral: 1, Downweight: 0.5, Exclude: 0 });

export function normalizeSustainabilityProfile(raw = {}, { company = {}, investmentAnalysis = {} } = {}) {
  const investments = Array.isArray(raw.internalInvestments) && raw.internalInvestments.length
    ? raw.internalInvestments.map(normalizeInternalInvestment)
    : (investmentAnalysis.items ?? []).map((item) => normalizeInternalInvestment({
        name: item.name,
        category: item.category,
        amount: item.amount,
        status: deliveryStatusFromText(`${item.assessment ?? ""} ${item.expectedImpact ?? ""}`),
        expectedImpact: item.expectedImpact,
        citations: item.citations,
      }));

  return {
    sector: normalizeSector(raw.sector, company),
    emissions: normalizeEmissions(raw.emissions),
    target: normalizeTarget(raw.target ?? raw.targets?.[0]),
    internalInvestments: investments,
    carbonCredits: normalizeCarbonCredits(raw.carbonCredits),
    evidenceCount: uniqueCitations([
      ...investments.flatMap((item) => item.citations),
      ...(raw.emissions?.citations ?? []),
      ...(raw.target?.citations ?? raw.targets?.flatMap((target) => target.citations ?? []) ?? []),
      ...(raw.carbonCredits?.citations ?? []),
    ]).length,
  };
}

export function buildSustainabilityAnalysis(profileInput, {
  benchmarkData = sustainabilityBenchmarkData,
  sectorOverride,
  scenario = "median",
  startYear = new Date().getUTCFullYear() + 1,
  budgetCapUsd = null,
} = {}) {
  const profile = normalizeSustainabilityProfile(profileInput);
  const sectorKey = validSector(sectorOverride, benchmarkData) ? sectorOverride : profile.sector.key;
  const sector = benchmarkData.sectors[sectorKey] ?? benchmarkData.sectors.market_only;
  const comparablePeers = sector.peers.filter((peer) => peer.comparable);
  const peerStats = buildPeerStats(comparablePeers, benchmarkData.categories);
  const internal = scoreInternalInvestment(profile, peerStats);
  const carbon = scoreCarbonPortfolio(profile, peerStats);
  const confidence = disclosureConfidence(profile, comparablePeers.length);
  const overall = overallAdequacy(internal, carbon);
  const recommendedMix = recommendMix(profile, peerStats, benchmarkData.categories);
  const purchasePlan = buildPurchasePlan(profile, {
    peerStats,
    recommendedMix,
    priceBands: benchmarkData.priceBands,
    scenario,
    startYear,
    budgetCapUsd,
  });

  return {
    frameworkVersion: sustainabilityAnalysisFrameworkVersion,
    generatedAt: new Date().toISOString(),
    benchmark: {
      version: benchmarkData.version,
      asOfDate: benchmarkData.asOfDate,
      sectorKey,
      sectorLabel: sector.label,
      peerCount: sector.peers.length,
      comparablePeerCount: comparablePeers.length,
      confidence: comparablePeers.length >= 3 ? "Comparable peer benchmark" : "Limited peer reference",
      methodologyNote: benchmarkData.methodologyNote,
      sources: [...benchmarkData.standards, ...benchmarkData.marketSources],
      peers: sector.peers,
    },
    ratings: { overall, disclosureConfidence: confidence, internalInvestment: internal, carbonPortfolio: carbon },
    comparisons: {
      internalInvestmentIntensity: peerStats.internalInvestmentIntensity,
      carbonCoverageRatio: peerStats.carbonCoverageRatio,
      clientMix: profile.carbonCredits.mix,
      peerMix: peerStats.portfolioMix,
      recommendedMix,
    },
    purchasePlan,
    recommendations: buildRecommendations(profile, internal, carbon, recommendedMix, benchmarkData),
    profile,
  };
}

export function scoreBand(score) {
  if (!Number.isFinite(score)) return "Not assessable";
  if (score >= 80) return "Leading";
  if (score >= 65) return "Aligned";
  if (score >= 50) return "Developing";
  return "Insufficient";
}

function scoreInternalInvestment(profile, peerStats) {
  const emissionsTotal = targetBoundaryEmissions(profile.emissions, profile.target?.boundary);
  const quantifiedAbatement = sum(profile.internalInvestments.map((item) => item.expectedAbatementTco2e));
  const investmentAmount = sum(profile.internalInvestments.map((item) => item.amountUsd));
  const targetGap = targetGapTco2e(emissionsTotal, profile.target);
  const intensity = investmentIntensity(profile.internalInvestments, profile);
  const dimensions = {
    targetGapCoverage: dimension(
      targetGap !== null && quantifiedAbatement !== null ? ratioScore(quantifiedAbatement, targetGap) : null,
      internalInvestmentWeights.targetGapCoverage,
      targetGap === null ? "A quantified target gap with matching emissions boundary was not disclosed." : quantifiedAbatement === null ? "Expected abatement was not quantified." : `${formatNumber(quantifiedAbatement)} tCO2e of cited abatement versus a ${formatNumber(targetGap)} tCO2e target gap.`,
    ),
    capitalCommitment: dimension(
      intensity !== null && peerStats.internalInvestmentIntensity ? percentileScore(intensity, peerStats.internalInvestmentIntensity) : investmentAmount !== null ? 50 : null,
      internalInvestmentWeights.capitalCommitment,
      peerStats.internalInvestmentIntensity ? "Compared with a minimum three-peer comparable intensity range." : investmentAmount !== null ? "A commitment is disclosed, but there are not three comparable peer denominators." : "No numeric investment commitment was disclosed.",
    ),
    materialityAlignment: dimension(
      profile.internalInvestments.length && profile.target ? materialityScore(profile.internalInvestments) : null,
      internalInvestmentWeights.materialityAlignment,
      profile.target ? "Investments are assessed against the disclosed target and emissions boundary." : "A quantified target was not disclosed.",
    ),
    deliveryStatus: dimension(
      profile.internalInvestments.length ? average(profile.internalInvestments.map(deliveryScore)) : null,
      internalInvestmentWeights.deliveryStatus,
      profile.internalInvestments.length ? "Based on disclosed approval, implementation or completion status." : "No cited investment was detected.",
    ),
    governanceVerification: dimension(
      profile.internalInvestments.length ? average(profile.internalInvestments.map((item) => item.verified ? 90 : 40)) : null,
      internalInvestmentWeights.governanceVerification,
      "External standards, assurance or project-level verification are credited only when disclosed.",
    ),
  };
  const score = dimensions.targetGapCoverage.score === null ? null : weightedScore(dimensions);
  return { score, band: scoreBand(score), applicable: profile.internalInvestments.length > 0, dimensions };
}

function scoreCarbonPortfolio(profile, peerStats) {
  const credits = profile.carbonCredits;
  const emissionsTotal = targetBoundaryEmissions(profile.emissions, profile.target?.boundary);
  if (credits.disclosureStatus === "not_disclosed") {
    return notAssessableTrack(carbonPortfolioWeights, "Carbon-credit volume and use were not disclosed.");
  }
  const volume = firstNumber(credits.retiredTco2e, credits.contractedTco2e, credits.purchasedTco2e, credits.disclosureStatus === "confirmed_zero" ? 0 : null);
  const coverage = volume !== null && emissionsTotal ? volume / emissionsTotal : null;
  const dimensions = {
    volumeCoverage: dimension(
      coverage !== null && peerStats.carbonCoverageRatio ? percentileScore(coverage, peerStats.carbonCoverageRatio) : coverage !== null ? Math.min(100, Math.round(coverage * 200)) : null,
      carbonPortfolioWeights.volumeCoverage,
      peerStats.carbonCoverageRatio ? "Compared with a minimum three-peer comparable coverage range." : coverage !== null ? "Coverage is shown without an industry percentile because comparable peer disclosure is insufficient." : "No matching emissions denominator was available.",
    ),
    creditIntegrity: dimension(integrityScore(credits), carbonPortfolioWeights.creditIntegrity, "Traceable registry, methodology, verification and double-counting controls are required."),
    clientSectorFit: dimension(credits.mix.length ? portfolioFitScore(credits.mix) : null, carbonPortfolioWeights.clientSectorFit, "Categories are assessed for fit with the client's residual-emissions context."),
    removalTrajectory: dimension(credits.mix.length ? removalShareScore(credits.mix) : null, carbonPortfolioWeights.removalTrajectory, "Higher removal and durable-storage exposure supports the long-term transition, but is not treated as a universal fixed percentage."),
    procurementClaims: dimension(procurementClaimsScore(credits), carbonPortfolioWeights.procurementClaims, "Contracting, retirement and claims evidence are assessed separately."),
  };
  let score = weightedScore(dimensions);
  const integrityGateFailure = Boolean(credits.doubleCountingConcern || (credits.claimMade && !credits.retiredTco2e));
  if (integrityGateFailure) score = Math.min(score ?? 49, 49);
  if (!credits.registry && !credits.methodology) score = Math.min(score ?? 49, 49);
  return { score, band: scoreBand(score), applicable: true, integrityGateFailure, dimensions, coverageRatio: coverage };
}

function overallAdequacy(internal, carbon) {
  const applicable = [internal, carbon].filter((track) => track.applicable);
  if (!applicable.length || applicable.some((track) => track.score === null)) return "Not assessable";
  if (applicable.some((track) => track.integrityGateFailure || track.score < 50)) return "Insufficient";
  if (applicable.every((track) => track.score >= 65)) return "Adequate";
  return "Partially adequate";
}

export function buildPurchasePlan(profileInput, {
  peerStats = {},
  recommendedMix = [],
  priceBands = sustainabilityBenchmarkData.priceBands,
  scenario = "median",
  startYear = new Date().getUTCFullYear() + 1,
  budgetCapUsd = null,
} = {}) {
  const profile = normalizeSustainabilityProfile(profileInput);
  const emissions = targetBoundaryEmissions(profile.emissions, profile.target?.boundary);
  const target = profile.target;
  const coverageStats = peerStats.carbonCoverageRatio;
  const coverageTarget = coverageStats ? coverageStats[scenario === "p25" ? "p25" : scenario === "p75" ? "p75" : "median"] : null;
  const currentVolume = firstNumber(profile.carbonCredits.retiredTco2e, profile.carbonCredits.contractedTco2e, profile.carbonCredits.purchasedTco2e);
  const currentCoverage = emissions && currentVolume !== null ? currentVolume / emissions : 0;
  const missingInputs = [];
  if (emissions === null) missingInputs.push("Matching-boundary emissions");
  if (!target) missingInputs.push("Quantified target and target boundary");
  if (coverageTarget === null) missingInputs.push("At least three comparable peer coverage ratios");
  if (!recommendedMix.length) missingInputs.push("Comparable or disclosed portfolio mix");
  if (missingInputs.length) {
    return { assessable: false, scenario, startYear, budgetCapUsd, missingInputs, years: [], priceAvailability: "Unavailable until sourced category price bands are loaded." };
  }

  const years = [0, 1, 2].map((offset) => {
    const year = Number(startYear) + offset;
    const projectedResidualTco2e = projectedEmissions(emissions, profile.emissions.year, target, year);
    const coverageRatio = currentCoverage + (coverageTarget - currentCoverage) * ((offset + 1) / 3);
    let requestedVolume = Math.max(0, projectedResidualTco2e * coverageRatio);
    const allocation = allocateVolume(requestedVolume, recommendedMix, priceBands);
    if (Number.isFinite(Number(budgetCapUsd)) && Number(budgetCapUsd) >= 0 && allocation.costBaseUsd && allocation.costBaseUsd > Number(budgetCapUsd)) {
      const factor = Number(budgetCapUsd) / allocation.costBaseUsd;
      requestedVolume *= factor;
    }
    const finalAllocation = allocateVolume(requestedVolume, recommendedMix, priceBands);
    return { year, projectedResidualTco2e, coverageRatio, volumeTco2e: requestedVolume, ...finalAllocation };
  });
  return { assessable: true, scenario, startYear: Number(startYear), budgetCapUsd, missingInputs: [], years, priceAvailability: years.every((year) => year.priceComplete) ? "Complete" : "Partial — unsourced categories are not priced." };
}

export function normalizeRecommendedMix(items = []) {
  const weighted = items
    .map((item) => ({ ...item, share: numeric(item.share), fit: validFit(item.fit) ? item.fit : "Neutral" }))
    .filter((item) => item.share !== null && item.share >= 0 && categoryFitFactors[item.fit] > 0)
    .map((item) => ({ ...item, adjusted: item.share * categoryFitFactors[item.fit] }));
  const total = sum(weighted.map((item) => item.adjusted));
  if (!total) return [];
  const normalized = weighted.map((item) => ({ key: item.key, label: item.label, fit: item.fit, share: round2((item.adjusted / total) * 100), rationale: item.rationale ?? "" }));
  const drift = round2(100 - sum(normalized.map((item) => item.share)));
  if (normalized.length) normalized[normalized.length - 1].share = round2(normalized[normalized.length - 1].share + drift);
  return normalized;
}

function recommendMix(profile, peerStats, categories) {
  const base = peerStats.portfolioMix?.length ? peerStats.portfolioMix : profile.carbonCredits.mix;
  if (!base?.length) return [];
  const byKey = new Map(categories.map((item) => [item.key, item.label]));
  return normalizeRecommendedMix(base.map((item) => {
    const key = item.key;
    const isRemoval = key === "nature_removal" || key === "durable_removal";
    const fit = key === "other" ? "Downweight" : key === "durable_removal" ? "Prefer" : "Neutral";
    return {
      key,
      label: byKey.get(key) ?? item.label ?? key,
      share: item.share,
      fit,
      rationale: isRemoval ? "Supports a progressive shift toward removals; project integrity and delivery risk still require diligence." : "Retained as a near-term peer or disclosed category, subject to ICVCM-aligned quality screening.",
    };
  }));
}

function buildRecommendations(profile, internal, carbon, recommendedMix, benchmarkData) {
  const citations = uniqueCitations([
    ...profile.internalInvestments.flatMap((item) => item.citations),
    ...profile.carbonCredits.citations,
  ]);
  const recommendations = [];
  if (internal.score === null) recommendations.push(rec("Adjust", "Internal investment", "Quantify project-level capex and expected tCO2e abatement against the same boundary as the climate target.", citations));
  else if (internal.score >= 65) recommendations.push(rec("Adopt", "Internal investment", "Continue the disclosed internal decarbonization program and preserve target-boundary evidence.", citations));
  else recommendations.push(rec("Adjust", "Internal investment", "Close the target-gap coverage, delivery or verification gaps before relying on credits.", citations));
  if (profile.carbonCredits.disclosureStatus === "not_disclosed") recommendations.push(rec("Adjust", "Carbon-credit disclosure", "Disclose whether credits are purchased, contracted or retired, including volume, registry, methodology, vintage and intended claim.", profile.carbonCredits.citations));
  if (carbon.integrityGateFailure) recommendations.push(rec("Avoid", "Current claims pathway", "Do not make a compensation claim until retirement, ownership and double-counting controls are evidenced.", profile.carbonCredits.citations));
  recommendedMix.forEach((item) => recommendations.push(rec(item.fit === "Prefer" ? "Adopt" : item.fit === "Downweight" ? "Adjust" : "Adopt", item.label, item.rationale, profile.carbonCredits.citations)));
  if (!recommendedMix.length) recommendations.push(rec("Adjust", "Portfolio mix", "A percentage mix is withheld because neither the client nor at least three comparable peers disclosed a complete portfolio composition.", profile.carbonCredits.citations));
  return recommendations.map((item) => ({ ...item, standardSources: benchmarkData.standards.slice(0, 4).map(({ name, url }) => ({ name, url })) }));
}

function rec(action, category, rationale, evidence) {
  return { action, category, rationale, evidence: evidence.slice(0, 2) };
}

function buildPeerStats(peers, categories) {
  const intensity = peers.map((peer) => numeric(peer.internalInvestmentIntensity)).filter(Number.isFinite);
  const coverage = peers.map((peer) => numeric(peer.carbonCoverageRatio)).filter(Number.isFinite);
  const completeMixes = peers.map((peer) => peer.portfolioMix).filter((mix) => Array.isArray(mix) && mix.length);
  return {
    internalInvestmentIntensity: intensity.length >= 3 ? distribution(intensity) : null,
    carbonCoverageRatio: coverage.length >= 3 ? distribution(coverage) : null,
    portfolioMix: completeMixes.length >= 3 ? categories.map((category) => ({ key: category.key, label: category.label, share: median(completeMixes.map((mix) => numeric(mix.find((item) => item.key === category.key)?.share) ?? 0)) })).filter((item) => item.share > 0) : null,
  };
}

function normalizeSector(value, company) {
  const supplied = typeof value === "string" ? value : value?.key;
  if (["semiconductors", "ict_technology", "development_finance", "market_only"].includes(supplied)) {
    return { key: supplied, confidence: value?.confidence ?? "High" };
  }
  const text = `${company?.name ?? ""} ${company?.label ?? ""} ${company?.subtitle ?? ""}`.toLowerCase();
  if (/tsmc|nvidia|semiconductor|chip|micron|hynix/.test(text)) return { key: "semiconductors", confidence: "High" };
  if (/aiib|development bank|world bank|finance|bank/.test(text)) return { key: "development_finance", confidence: "High" };
  if (/technology|software|digital|ict|cloud/.test(text)) return { key: "ict_technology", confidence: "Medium" };
  return { key: "market_only", confidence: "Low" };
}

function normalizeEmissions(value = {}) {
  const scopes = value.scopes ?? value;
  return {
    year: integer(value.year),
    scope1Tco2e: numeric(scopes.scope1Tco2e ?? scopes.scope1),
    scope2Tco2e: numeric(scopes.scope2Tco2e ?? scopes.scope2),
    scope3Tco2e: numeric(scopes.scope3Tco2e ?? scopes.scope3),
    totalTco2e: numeric(value.totalTco2e ?? scopes.total),
    citations: sanitizeCitations(value.citations),
  };
}

function normalizeTarget(value) {
  if (!value) return null;
  const reductionPercent = numeric(value.reductionPercent);
  const targetYear = integer(value.targetYear);
  if (reductionPercent === null || targetYear === null) return null;
  return {
    baselineYear: integer(value.baselineYear),
    targetYear,
    reductionPercent,
    boundary: String(value.boundary || "scope1_scope2").toLowerCase(),
    citations: sanitizeCitations(value.citations),
  };
}

function normalizeInternalInvestment(value = {}) {
  return {
    name: String(value.name || "Sustainability investment"),
    category: String(value.category || "other"),
    amountUsd: numeric(value.amountUsd ?? parseAmount(value.amount)),
    requiredCapitalUsd: numeric(value.requiredCapitalUsd),
    committedCapitalUsd: numeric(value.committedCapitalUsd ?? value.amountUsd ?? parseAmount(value.amount)),
    expectedAbatementTco2e: numeric(value.expectedAbatementTco2e),
    deliveryYear: integer(value.deliveryYear),
    status: value.status || "not_disclosed",
    verified: Boolean(value.verified),
    mrvReady: Boolean(value.mrvReady ?? value.verified),
    emissionsSource: String(value.emissionsSource || ""),
    expectedImpact: String(value.expectedImpact || ""),
    citations: sanitizeCitations(value.citations),
  };
}

function normalizeCarbonCredits(value = {}) {
  const disclosureStatus = ["disclosed", "confirmed_zero", "not_disclosed"].includes(value.disclosureStatus)
    ? value.disclosureStatus
    : [value.purchasedTco2e, value.retiredTco2e, value.contractedTco2e].some((item) => numeric(item) !== null) ? "disclosed" : "not_disclosed";
  return {
    disclosureStatus,
    purchasedTco2e: numeric(value.purchasedTco2e),
    retiredTco2e: numeric(value.retiredTco2e),
    contractedTco2e: numeric(value.contractedTco2e),
    mix: normalizeMix(value.mix),
    credits: Array.isArray(value.credits) ? value.credits.map((credit) => ({
      name: String(credit.name || "Carbon credit"),
      volumeTco2e: numeric(credit.volumeTco2e),
      type: String(credit.type || "other"),
      registry: String(credit.registry || ""),
      methodology: String(credit.methodology || ""),
      vintage: integer(credit.vintage),
      deliveryYear: integer(credit.deliveryYear),
      contractType: String(credit.contractType || ""),
      ccpApproved: Boolean(credit.ccpApproved),
      verified: Boolean(credit.verified),
      additionalityEvidence: Boolean(credit.additionalityEvidence),
      noDoubleCounting: Boolean(credit.noDoubleCounting),
      ownershipConfirmed: Boolean(credit.ownershipConfirmed),
      replacementRemedy: Boolean(credit.replacementRemedy),
      retired: Boolean(credit.retired),
      claimMade: Boolean(credit.claimMade),
      claimBoundaryConfirmed: Boolean(credit.claimBoundaryConfirmed),
      deliveryRiskPercent: numeric(credit.deliveryRiskPercent),
      citations: sanitizeCitations(credit.citations),
    })) : [],
    registry: value.registry ? String(value.registry) : "",
    methodology: value.methodology ? String(value.methodology) : "",
    verified: Boolean(value.verified),
    claimMade: Boolean(value.claimMade),
    doubleCountingConcern: Boolean(value.doubleCountingConcern),
    procurementType: value.procurementType ? String(value.procurementType) : "",
    citations: sanitizeCitations(value.citations),
  };
}

function normalizeMix(items = []) {
  const clean = items.map((item) => ({ key: item.key, label: item.label ?? item.key, share: numeric(item.share) })).filter((item) => item.key && item.share !== null && item.share >= 0);
  const total = sum(clean.map((item) => item.share));
  if (!total) return [];
  return clean.map((item) => ({ ...item, share: round2((item.share / total) * 100) }));
}

function targetBoundaryEmissions(emissions, boundary = "scope1_scope2") {
  if (emissions.totalTco2e !== null) return emissions.totalTco2e;
  const values = boundary.includes("scope3")
    ? [emissions.scope1Tco2e, emissions.scope2Tco2e, emissions.scope3Tco2e]
    : [emissions.scope1Tco2e, emissions.scope2Tco2e];
  return values.every((value) => value !== null) ? sum(values) : null;
}

function targetGapTco2e(emissions, target) {
  if (emissions === null || !target) return null;
  return emissions * Math.max(0, Math.min(100, target.reductionPercent)) / 100;
}

function projectedEmissions(latestEmissions, latestYear, target, year) {
  if (!target || latestYear === null || target.targetYear <= latestYear) return latestEmissions;
  const targetEmissions = latestEmissions * (1 - Math.max(0, Math.min(100, target.reductionPercent)) / 100);
  const progress = Math.max(0, Math.min(1, (year - latestYear) / (target.targetYear - latestYear)));
  return latestEmissions + (targetEmissions - latestEmissions) * progress;
}

function allocateVolume(volume, mix, priceBands) {
  const byCategory = mix.map((item) => {
    const itemVolume = volume * item.share / 100;
    const band = priceBands[item.key];
    return {
      key: item.key,
      label: item.label,
      share: item.share,
      volumeTco2e: itemVolume,
      costLowUsd: band ? itemVolume * band.low : null,
      costBaseUsd: band ? itemVolume * band.base : null,
      costHighUsd: band ? itemVolume * band.high : null,
    };
  });
  const priceComplete = byCategory.every((item) => item.costBaseUsd !== null);
  return {
    byCategory,
    priceComplete,
    costLowUsd: priceComplete ? sum(byCategory.map((item) => item.costLowUsd)) : null,
    costBaseUsd: priceComplete ? sum(byCategory.map((item) => item.costBaseUsd)) : null,
    costHighUsd: priceComplete ? sum(byCategory.map((item) => item.costHighUsd)) : null,
  };
}

function disclosureConfidence(profile, comparablePeerCount) {
  const checks = [
    targetBoundaryEmissions(profile.emissions, profile.target?.boundary) !== null,
    Boolean(profile.target),
    profile.internalInvestments.some((item) => item.amountUsd !== null || item.expectedAbatementTco2e !== null),
    profile.carbonCredits.disclosureStatus !== "not_disclosed",
    Boolean(profile.carbonCredits.registry || profile.carbonCredits.methodology),
    comparablePeerCount >= 3,
  ];
  const ratio = checks.filter(Boolean).length / checks.length;
  return ratio >= 0.8 ? "High" : ratio >= 0.5 ? "Medium" : "Low";
}

function dimension(score, weight, explanation) {
  return { score: Number.isFinite(score) ? Math.round(Math.max(0, Math.min(100, score))) : null, weight, explanation };
}

function weightedScore(dimensions) {
  const applicable = Object.values(dimensions).filter((item) => item.score !== null);
  if (!applicable.length) return null;
  const weight = sum(applicable.map((item) => item.weight));
  return Math.round(sum(applicable.map((item) => item.score * item.weight)) / weight);
}

function notAssessableTrack(weights, explanation) {
  return {
    score: null,
    band: "Not assessable",
    applicable: false,
    integrityGateFailure: false,
    dimensions: Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, dimension(null, weight, explanation)])),
  };
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { p25: quantile(sorted, 0.25), median: quantile(sorted, 0.5), p75: quantile(sorted, 0.75), count: sorted.length };
}

function quantile(sorted, position) {
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

function percentileScore(value, stats) {
  if (value >= stats.p75) return 85;
  if (value >= stats.median) return 70;
  if (value >= stats.p25) return 55;
  return 35;
}

function ratioScore(value, denominator) {
  if (!denominator) return 0;
  return Math.round(Math.min(100, value / denominator * 100));
}

function materialityScore(investments) {
  const material = investments.filter((item) => /renewable|energy|emission|carbon|supplier|transport|building|methane/i.test(`${item.category} ${item.name} ${item.expectedImpact}`)).length;
  return Math.round(material / investments.length * 100);
}

function deliveryScore(item) {
  if (/complete|operational/i.test(item.status)) return 90;
  if (/underway|implement|contract|approved/i.test(item.status)) return 70;
  if (/planned|proposed/i.test(item.status)) return 45;
  return 30;
}

function integrityScore(credits) {
  let score = 0;
  if (credits.registry) score += 25;
  if (credits.methodology) score += 25;
  if (credits.verified) score += 25;
  if (!credits.doubleCountingConcern) score += 25;
  return score;
}

function portfolioFitScore(mix) {
  return mix.some((item) => item.key !== "other") ? 70 : 35;
}

function removalShareScore(mix) {
  const removal = sum(mix.filter((item) => ["nature_removal", "durable_removal"].includes(item.key)).map((item) => item.share));
  return Math.round(Math.min(100, 40 + removal * 0.6));
}

function procurementClaimsScore(credits) {
  let score = credits.procurementType ? 30 : 0;
  if (credits.contractedTco2e !== null) score += 20;
  if (credits.retiredTco2e !== null) score += 30;
  if (!credits.claimMade || credits.retiredTco2e !== null) score += 20;
  return Math.min(100, score);
}

function investmentIntensity(investments, profile) {
  const amount = sum(investments.map((item) => item.amountUsd));
  const denominator = numeric(profile.totalCapexUsd ?? profile.revenueUsd);
  return amount !== null && denominator ? amount / denominator : null;
}

function deliveryStatusFromText(text) {
  if (/completed|operational/.test(text)) return "completed";
  if (/underway|implemented|contracted|approved/.test(text)) return "underway";
  if (/planned|proposed/.test(text)) return "planned";
  return "not_disclosed";
}

function parseAmount(value) {
  const text = String(value ?? "");
  const match = text.replace(/,/g, "").match(/(?:usd|us\$|\$)\s*([0-9]+(?:\.[0-9]+)?)\s*(billion|million|bn|m)?/i);
  if (!match) return null;
  const multiplier = /billion|bn/i.test(match[2] ?? "") ? 1_000_000_000 : /million|m/i.test(match[2] ?? "") ? 1_000_000 : 1;
  return Number(match[1]) * multiplier;
}

function firstNumber(...values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function integer(value) {
  const result = numeric(value);
  return Number.isInteger(result) ? result : null;
}

function validSector(value, benchmarkData) {
  return Boolean(value && benchmarkData.sectors[value]);
}

function validFit(value) {
  return Object.hasOwn(categoryFitFactors, value);
}

function sanitizeCitations(items = []) {
  return items.filter((item) => item?.quote && Array.isArray(item.pages) && item.pages.every((page) => Number.isInteger(page) && page > 0)).map((item) => ({ quote: String(item.quote), pages: [...new Set(item.pages)] }));
}

function uniqueCitations(items) {
  const seen = new Set();
  return sanitizeCitations(items).filter((item) => {
    const key = `${item.quote}|${item.pages.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sum(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((total, value) => total + value, 0) : null;
}

function average(values) {
  const total = sum(values);
  return total === null ? null : total / values.filter(Number.isFinite).length;
}

function median(values) {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value) {
  return Math.round(value).toLocaleString("en-US");
}
