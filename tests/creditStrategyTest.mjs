import assert from "node:assert/strict";
import { semiconductorCreditStrategyFixture } from "../fixtures/semiconductorCreditStrategy.js";
import {
  buildCreditStrategyAnalysis,
  calculateProcurementScenario,
  scoreBand,
} from "../models/creditStrategyModel.js";
import { illustrativeCreditStrategyMarket } from "../data/creditStrategyMarket.js";
import { createCreditStrategyJobQueue, createLocalCreditStrategyRepository } from "../extraction/creditStrategyJobQueue.js";

const analysis = buildCreditStrategyAnalysis(semiconductorCreditStrategyFixture);
assert.equal(analysis.managementConclusion.action, "Start sourcing");
assert.equal(analysis.managementConclusion.recommendedStrategy, "Staged Procurement");
assert.equal(analysis.scores.capitalAllocation.band, scoreBand(analysis.scores.capitalAllocation.score));
assert.equal(analysis.scores.currentPortfolio.score, null);
assert.match(analysis.scores.currentPortfolio.band, /no portfolio/i);
assert.equal(analysis.investmentPriorities.length, 3);
assert.equal(analysis.procurementScenarios.length, 3);
assert.equal(analysis.procurementScenarios.filter((item) => item.recommended).length, 1);
assert.equal(new Set(analysis.procurementScenarios.map((item) => item.totalDemandTco2e)).size, 1);
assert.equal(analysis.market.illustrative, true);

const risky = buildCreditStrategyAnalysis({
  ...semiconductorCreditStrategyFixture,
  evidenceProfile: {
    ...semiconductorCreditStrategyFixture.evidenceProfile,
    currentPortfolio: {
      disclosureStatus: "disclosed",
      credits: [{
        volumeTco2e: 1000,
        type: "nature_removal",
        registry: "Registry",
        methodology: "Method",
        verified: true,
        additionalityEvidence: true,
        noDoubleCounting: false,
        ownershipConfirmed: false,
        replacementRemedy: false,
        retired: false,
        claimMade: true,
        claimBoundaryConfirmed: false,
        deliveryRiskPercent: 20,
      }],
    },
  },
});
assert.equal(risky.managementConclusion.action, "Do not procure yet");
assert.equal(risky.scores.currentPortfolio.highRisk, true);
assert.ok(risky.scores.currentPortfolio.score <= 49);

const noBoundary = buildCreditStrategyAnalysis({
  ...semiconductorCreditStrategyFixture,
  questionnaire: { ...semiconductorCreditStrategyFixture.questionnaire, confirmedBoundary: false, demandVolumeTco2e: null },
});
assert.equal(noBoundary.managementConclusion.action, "Prepare only");

const scenario = calculateProcurementScenario({
  key: "staged",
  strategy: illustrativeCreditStrategyMarket.strategies.staged,
  demand: { years: [{ year: 2027, volumeTco2e: 1000 }] },
  mix: [{ key: "durable_removal", share: 100 }],
  market: illustrativeCreditStrategyMarket,
  answers: { costOfCapitalPercent: 8 },
  startYear: 2027,
});
assert.ok(scenario.nominalCostUsd > 0);
assert.ok(scenario.npvCostUsd > 0);
assert.ok(scenario.securedVolumeTco2e > 0);
assert.ok(scenario.deliveryAtRiskTco2e > 0);

assert.equal(scoreBand(80), "Strong");
assert.equal(scoreBand(65), "Sound");
assert.equal(scoreBand(50), "Needs adjustment");
assert.equal(scoreBand(49), "Weak");

let aiCalls = 0;
const repository = createLocalCreditStrategyRepository();
const queue = createCreditStrategyJobQueue({
  repository,
  evidenceMapper: async () => {
    aiCalls += 1;
    return {
      projectMappings: [{
        name: "Process-gas abatement upgrade",
        lever: "process_gases",
        interpretation: "Mapped from cited evidence.",
        citationQuote: "Illustrative project assumption: Process-gas abatement upgrade.",
        inventedAmountUsd: 999999999,
      }],
    };
  },
});
const queued = await queue.createJob({
  sourceJobId: "source-credit-1",
  token: "credit-secret",
  company: semiconductorCreditStrategyFixture.company,
  evidenceProfile: semiconductorCreditStrategyFixture.evidenceProfile,
  questionnaire: semiconductorCreditStrategyFixture.questionnaire,
});
await new Promise((resolve) => setTimeout(resolve, 0));
const completed = await queue.getAuthorized(queued.id, "credit-secret");
assert.equal(completed.status, "completed");
assert.equal(completed.result.aiEnrichment.used, true);
assert.equal(aiCalls, 1);
assert.equal(await queue.getAuthorized(queued.id, "wrong"), null);
assert.equal(completed.result.evidenceProfile.projects[0].inventedAmountUsd, undefined);
const cached = await queue.createJob({
  sourceJobId: "source-credit-1",
  token: "credit-secret",
  company: semiconductorCreditStrategyFixture.company,
  evidenceProfile: semiconductorCreditStrategyFixture.evidenceProfile,
  questionnaire: { ...semiconductorCreditStrategyFixture.questionnaire, annualBudgetUsd: 1 },
});
assert.equal(cached.status, "completed");
assert.equal(cached.cacheHit, true);
assert.equal(aiCalls, 1);

console.log("Credit strategy tests passed.");
