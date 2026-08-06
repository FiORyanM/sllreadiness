import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { creditStrategyFrameworkVersion } from "../models/creditStrategyModel.js";
import { illustrativeCreditStrategyMarket } from "../data/creditStrategyMarket.js";
import { tsmcCreditStrategyFixture } from "../fixtures/tsmcCreditStrategy.js";

const fixture = tsmcCreditStrategyFixture;
const analysis = fixture.result;

assert.equal(fixture.demoMode, "precomputed");
assert.equal(fixture.sourceLabel, "TSMC 2024 Sustainability Report");
assert.equal(fixture.sourcePageCount, 278);
assert.equal(analysis.company, "TSMC");
assert.equal(analysis.generatedAt, fixture.generatedAt);
assert.equal(analysis.frameworkVersion, creditStrategyFrameworkVersion);
assert.equal(analysis.market.version, illustrativeCreditStrategyMarket.version);
assert.equal(fixture.input.startYear, 2030);
assert.equal(analysis.demand.years.length, 3);
assert.deepEqual(analysis.demand.years.map((year) => year.year), [2030, 2031, 2032]);
assert.equal(analysis.demand.years.every((year) => year.volumeTco2e === 627_000), true);
assert.equal(analysis.procurementScenarios.length, 3);
assert.equal(analysis.procurementScenarios.every((scenario) => scenario.totalDemandTco2e > 0), true);
assert.equal(new Set(analysis.procurementScenarios.map((scenario) => scenario.totalDemandTco2e)).size, 1);
const recommendedScenario = analysis.procurementScenarios.find((scenario) => scenario.recommended);
assert.ok(recommendedScenario);
assert.equal(recommendedScenario.nominalCostUsd, 98_889_186);
assert.equal(recommendedScenario.npvCostUsd, 67_113_042);
assert.equal(analysis.scores.capitalAllocation.score, null);
assert.match(analysis.scores.capitalAllocation.band, /N\/A/);
assert.equal(analysis.investmentPriorities.every((project) => project.fundingGapUsd === null), true);
assert.equal(analysis.investmentPriorities.every((project) => /capex not disclosed/i.test(project.rationale)), true);
assert.match(fixture.assumptions.join(" "), /not estimated/i);

const reportPages = JSON.parse(await readFile(new URL("../tmp/pdfs/tsmc-pages.json", import.meta.url), "utf8"));
assert.equal(reportPages.length, fixture.sourcePageCount);

const citations = [
  ...(fixture.input.evidenceProfile.emissions.citations ?? []),
  ...(fixture.input.evidenceProfile.target.citations ?? []),
  ...fixture.input.evidenceProfile.projects.flatMap((project) => project.citations ?? []),
  ...(fixture.input.evidenceProfile.currentPortfolio.citations ?? []),
];

for (const citation of citations) {
  assert.ok(citation.quote);
  assert.ok(citation.pages.length > 0);
  for (const pageNumber of citation.pages) {
    const page = reportPages.find((item) => item.page === pageNumber);
    assert.ok(page, `Missing TSMC report page ${pageNumber}`);
    const pageTokens = new Set(tokens(page.text));
    const missing = tokens(citation.quote).filter((token) => !pageTokens.has(token));
    assert.deepEqual(missing, [], `Citation tokens not found on PDF p. ${pageNumber}: ${citation.quote}`);
  }
}

console.log("TSMC sustainability investment demo tests passed.");

function tokens(value) {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/tco\s*2\s*e/g, "tco2e")
    .replace(/co\s*2\s*e/g, "co2e")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9$%']+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
