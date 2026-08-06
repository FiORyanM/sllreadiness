const citation = (quote, pages) => ({ quote, pages });

export const semiconductorCreditStrategyFixture = Object.freeze({
  company: "Illustrative Semiconductor Co.",
  sourceLabel: "Illustrative semiconductor decision brief",
  evidenceProfile: {
    sector: "semiconductors",
    emissions: {
      year: 2026,
      scope1Tco2e: 360000,
      scope2Tco2e: 540000,
      scope3Tco2e: 2100000,
      targetBoundaryTco2e: 900000,
      citations: [citation("Illustrative Scope 1 and Scope 2 inventory totals 900,000 tCO2e in 2026.", [12])],
    },
    target: {
      baselineYear: 2026,
      targetYear: 2030,
      reductionPercent: 50,
      boundary: "scope1_scope2",
      targetEmissionsTco2e: 450000,
      citations: [citation("Illustrative target: reduce Scope 1 and Scope 2 emissions 50% by 2030.", [18])],
    },
    projects: [
      project("Process-gas abatement upgrade", "process_gases", 60000000, 25000000, 150000, 2028, "underway", true, 0.86),
      project("Renewable electricity portfolio", "renewable_electricity", 80000000, 50000000, 180000, 2029, "approved", false, 0.92),
      project("Fab energy-efficiency program", "energy_efficiency", 30000000, 10000000, 60000, 2027, "underway", true, 0.78),
      project("Low-carbon supplier materials", "scope3_supply_chain", 45000000, 5000000, 90000, 2030, "planned", false, 0.55),
    ],
    currentPortfolio: { disclosureStatus: "confirmed_zero", credits: [], citations: [] },
  },
  questionnaire: {
    confirmedBoundary: true,
    publicClaimPlanned: true,
    useYear: 2028,
    annualBudgetUsd: 10000000,
    riskAppetite: "balanced",
    maxUpfrontPercent: 30,
    costOfCapitalPercent: 8,
    demandVolumeTco2e: 60000,
    demandConfidence: "Medium",
  },
});

function project(name, lever, requiredCapitalUsd, committedCapitalUsd, expectedAbatementTco2e, deliveryYear, status, mrvReady, sourceCoverage) {
  return {
    name,
    lever,
    requiredCapitalUsd,
    committedCapitalUsd,
    expectedAbatementTco2e,
    deliveryYear,
    status,
    mrvReady,
    sourceCoverage,
    citations: [citation(`Illustrative project assumption: ${name}.`, [24])],
  };
}
