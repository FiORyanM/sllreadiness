export const costRanges = {
  high: {
    dataInfrastructure: [0, 20000],
    kpiMethodology: [5000, 15000],
    legal: [10000, 20000],
    sustainabilityCoordinator: [0, 25000],
    spo: [15000, 25000],
    verificationPerKpiYear: [5000, 10000],
    reportingPerYear: [5000, 12000],
  },
  medium: {
    dataInfrastructure: [20000, 60000],
    kpiMethodology: [10000, 25000],
    legal: [15000, 25000],
    sustainabilityCoordinator: [20000, 45000],
    spo: [20000, 35000],
    verificationPerKpiYear: [8000, 15000],
    reportingPerYear: [10000, 20000],
  },
  low: {
    dataInfrastructure: [80000, 150000],
    kpiMethodology: [20000, 35000],
    legal: [20000, 35000],
    sustainabilityCoordinator: [40000, 75000],
    spo: [30000, 50000],
    verificationPerKpiYear: [12000, 20000],
    reportingPerYear: [18000, 30000],
  },
};

const setupDrivers = ["dataInfrastructure", "kpiMethodology", "legal", "sustainabilityCoordinator", "spo"];

function roundToNearest(value, increment) {
  return Math.round(value / increment) * increment;
}

function sumSetupCost(range, index, options = {}) {
  return setupDrivers.reduce((sum, key) => {
    if (options.excludedDrivers?.includes(key)) return sum;
    const value = range[key][index];
    const floor = options?.bestCaseSetupFloors?.[key] ?? 0;
    return sum + Math.max(value, floor);
  }, 0);
}

export function calculateExecutionCost({
  readinessBand,
  kpiCount,
  tenor,
  hasLowConfidence = false,
  options = {},
}) {
  const band = costRanges[readinessBand] ? readinessBand : "low";
  const range = costRanges[band];

  const bestSetupCost = sumSetupCost(range, 0, {
    bestCaseSetupFloors: options.bestCaseSetupFloors,
  });
  const worstSetupCost = sumSetupCost(range, 1, {
    excludedDrivers: options.worstCaseExcludedDrivers,
  });

  const best =
    bestSetupCost + range.verificationPerKpiYear[0] * kpiCount * tenor + range.reportingPerYear[0] * tenor;
  const rawWorst =
    worstSetupCost + range.verificationPerKpiYear[1] * kpiCount * tenor + range.reportingPerYear[1] * tenor;
  const worst = hasLowConfidence ? rawWorst * 1.2 : rawWorst;

  return {
    band,
    best: roundToNearest(best, 5000),
    worst: roundToNearest(worst, 5000),
    rawWorst: roundToNearest(rawWorst, 5000),
    confidencePenaltyApplied: hasLowConfidence,
  };
}
