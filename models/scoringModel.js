const maturityValues = {
  high: 1,
  medium: 0.5,
  low: 0.2,
  absent: 0,
};

export const sllWeights = {
  kpiDataHistory: 0.25,
  kpiMethodology: 0.25,
  reportingInfrastructure: 0.2,
  externalVerification: 0.2,
  strategicAlignment: 0.1,
};

export function readinessBand(weightedAverage) {
  if (weightedAverage >= 0.75) return "high";
  if (weightedAverage >= 0.4) return "medium";
  return "low";
}

export function maturityToValue(maturity) {
  return maturityValues[maturity] ?? 0;
}

export function weightedReadiness(componentsByKey) {
  const score = Object.entries(sllWeights).reduce((sum, [key, weight]) => {
    return sum + maturityToValue(componentsByKey[key]?.maturity) * weight;
  }, 0);

  return {
    weightedAverage: score,
    score100: Math.round(score * 100),
    band: readinessBand(score),
  };
}

export function weightedReadinessFromScores(componentsByKey) {
  const score = Object.entries(sllWeights).reduce((sum, [key, weight]) => {
    const componentScore = componentsByKey[key]?.score ?? maturityToValue(componentsByKey[key]?.maturity) * 100;
    return sum + (componentScore / 100) * weight;
  }, 0);

  return {
    weightedAverage: score,
    score100: Math.round(score * 100),
    band: readinessBand(score),
  };
}

export function readinessBandLabel(band) {
  if (band === "high") return "High - ready to proceed";
  if (band === "medium") return "Medium - gaps to close";
  return "Low - not yet lender-ready";
}
