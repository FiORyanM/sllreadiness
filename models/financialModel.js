export function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function calculateScenario({ loanSize, tenor, baseMargin }, ratchet, execCost) {
  const regularInterest = loanSize * (baseMargin / 10000) * tenor;
  const sllInterest = loanSize * ((baseMargin - ratchet) / 10000) * tenor;
  const totalOutlay = sllInterest + execCost;
  const netSaving = regularInterest - sllInterest - execCost;
  const breakevenBps = (execCost / (loanSize * tenor)) * 10000;

  return {
    regularInterest,
    sllInterest,
    totalOutlay,
    netSaving,
    breakevenBps,
  };
}

export function dollars(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  }

  if (abs >= 1_000) {
    return `${sign}$${Math.round(abs / 1_000)}K`;
  }

  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function signedDollars(value) {
  return `${value >= 0 ? "+" : "-"}${dollars(Math.abs(value))}`;
}

export function loanMillions(value) {
  return `$${value.toFixed(2)}M`;
}
