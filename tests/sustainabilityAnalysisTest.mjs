import assert from "node:assert/strict";
import { sustainabilityBenchmarkData } from "../data/sustainabilityBenchmarks.js";
import {
  buildSustainabilityAnalysis,
  normalizeRecommendedMix,
  normalizeSustainabilityProfile,
  scoreBand,
} from "../models/sustainabilityAnalysisModel.js";
import {
  createLocalSustainabilityAnalysisRepository,
  createSustainabilityAnalysisJobQueue,
} from "../extraction/sustainabilityAnalysisJobQueue.js";

const citation = { quote: "The company disclosed the metric.", pages: [2] };
const profile = {
  sector: { key: "semiconductors", confidence: "High" },
  emissions: { year: 2025, scope1Tco2e: 1000, scope2Tco2e: 1000, scope3Tco2e: null, citations: [citation] },
  target: { baselineYear: 2025, targetYear: 2030, reductionPercent: 50, boundary: "scope1_scope2", citations: [citation] },
  internalInvestments: [{
    name: "Verified renewable project",
    category: "renewable_energy",
    amountUsd: 1_000_000,
    expectedAbatementTco2e: 700,
    status: "underway",
    verified: true,
    citations: [citation],
  }],
  carbonCredits: {
    disclosureStatus: "disclosed",
    purchasedTco2e: 200,
    retiredTco2e: 150,
    contractedTco2e: 300,
    mix: [
      { key: "nature_removal", share: 60 },
      { key: "durable_removal", share: 40 },
    ],
    registry: "Test registry",
    methodology: "Test methodology",
    verified: true,
    procurementType: "offtake",
    claimMade: false,
    doubleCountingConcern: false,
    citations: [citation],
  },
};

const comparablePeers = [
  peer("A", 0.01, 0.05, 70, 30),
  peer("B", 0.02, 0.1, 60, 40),
  peer("C", 0.03, 0.2, 50, 50),
];
const benchmark = {
  ...sustainabilityBenchmarkData,
  priceBands: {
    ...sustainabilityBenchmarkData.priceBands,
    nature_removal: { low: 10, base: 15, high: 20 },
    durable_removal: { low: 100, base: 150, high: 200 },
  },
  sectors: {
    ...sustainabilityBenchmarkData.sectors,
    semiconductors: { label: "Semiconductors", peers: comparablePeers },
  },
};

const analysis = buildSustainabilityAnalysis(profile, { benchmarkData: benchmark, sectorOverride: "semiconductors", startYear: 2027 });
assert.equal(analysis.benchmark.comparablePeerCount, 3);
assert.equal(analysis.benchmark.confidence, "Comparable peer benchmark");
assert.equal(analysis.purchasePlan.assessable, true);
assert.equal(analysis.purchasePlan.years.length, 3);
assert.equal(analysis.purchasePlan.years.every((year) => year.priceComplete), true);
assert.equal(Math.round(analysis.comparisons.recommendedMix.reduce((sum, item) => sum + item.share, 0)), 100);
assert.equal(scoreBand(80), "Leading");
assert.equal(scoreBand(65), "Aligned");
assert.equal(scoreBand(50), "Developing");
assert.equal(scoreBand(49), "Insufficient");

const excluded = normalizeRecommendedMix([
  { key: "nature_reduction", label: "Nature reduction", share: 50, fit: "Exclude" },
  { key: "durable_removal", label: "Durable removal", share: 50, fit: "Prefer" },
]);
assert.equal(excluded.length, 1);
assert.equal(excluded[0].key, "durable_removal");
assert.equal(excluded[0].share, 100);

const undisclosed = buildSustainabilityAnalysis({ ...profile, carbonCredits: { disclosureStatus: "not_disclosed" } }, { benchmarkData: benchmark });
const confirmedZero = buildSustainabilityAnalysis({ ...profile, carbonCredits: { ...profile.carbonCredits, disclosureStatus: "confirmed_zero", purchasedTco2e: 0, retiredTco2e: 0, contractedTco2e: 0 } }, { benchmarkData: benchmark });
assert.equal(undisclosed.ratings.carbonPortfolio.score, null);
assert.equal(Number.isFinite(confirmedZero.ratings.carbonPortfolio.score), true);
assert.notEqual(confirmedZero.ratings.overall, "Not assessable");

const limited = buildSustainabilityAnalysis(profile, { sectorOverride: "semiconductors" });
assert.equal(limited.benchmark.comparablePeerCount, 0);
assert.equal(limited.benchmark.confidence, "Limited peer reference");
assert.equal(limited.purchasePlan.assessable, false);
assert.equal(limited.purchasePlan.years.length, 0);

const repository = createLocalSustainabilityAnalysisRepository();
const queue = createSustainabilityAnalysisJobQueue({ repository });
const queued = await queue.createJob({ sourceJobId: "source-1", token: "secret", profile, options: { sectorOverride: "semiconductors" } });
assert.equal(["queued", "processing", "completed"].includes(queued.status), true);
await new Promise((resolve) => setTimeout(resolve, 0));
const completed = await queue.getAuthorized(queued.id, "secret");
assert.equal(completed.status, "completed");
assert.equal(Boolean(completed.result), true);
assert.equal(await queue.getAuthorized(queued.id, "wrong"), null);
const cached = await queue.createJob({ sourceJobId: "source-1", token: "secret", profile, options: { sectorOverride: "semiconductors" } });
assert.equal(cached.status, "completed");
assert.equal(cached.cacheHit, true);

const normalized = normalizeSustainabilityProfile({}, { company: { name: "TSMC" }, investmentAnalysis: { items: [] } });
assert.equal(normalized.sector.key, "semiconductors");

console.log("Sustainability analysis tests passed.");

function peer(name, intensity, coverage, natureShare, durableShare) {
  return {
    name,
    sourceUrl: `https://example.com/${name}`,
    comparable: true,
    disclosureConfidence: "High",
    internalInvestmentIntensity: intensity,
    carbonCoverageRatio: coverage,
    portfolioMix: [
      { key: "nature_removal", share: natureShare },
      { key: "durable_removal", share: durableShare },
    ],
  };
}
