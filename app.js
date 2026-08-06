import { aiibFixture } from "./fixtures/aiib.js";
import { nvidiaFixture } from "./fixtures/nvidia.js";
import { tsmcFixture } from "./fixtures/tsmc.js";
import { tsmcCreditStrategyFixture } from "./fixtures/tsmcCreditStrategy.js";
import { extractPdfText } from "./extraction/pdfExtractionAdapter.js";
import { validateSllExtractionJson } from "./extraction/sllExtractionAdapter.js";
import { frameworkContent } from "./frameworkContent.js";
import { mapExtractionToReport } from "./mappers/reportMapper.js";
import { calculateExecutionCost } from "./models/costModel.js";
import { calculateScenario, clamp, dollars, loanMillions, signedDollars } from "./models/financialModel.js";
import { readinessBandLabel, weightedReadinessFromScores } from "./models/scoringModel.js";
import { normalizeSustainabilityInvestmentAnalysis } from "./models/sustainabilityInvestmentModel.js";
import { normalizeSustainabilityProfile, buildSustainabilityAnalysis } from "./models/sustainabilityAnalysisModel.js";
import { buildCreditStrategyAnalysis } from "./models/creditStrategyModel.js";

let activeReport = enrichReport(aiibFixture);
let selectedUpload = null;
let isExtracting = false;
let pendingExtractionJob = null;
let activeExtractionJob = null;
let activeReportSource = null;
let activeSustainabilityJob = null;
let activeSustainabilityAnalysis = null;
let activeCreditStrategyAnalysis = null;
let activeCreditEvidence = null;
let activeCreditCompany = null;
let activeCreditDemo = null;
let creditStrategyReturnView = "report";

const creditStrategyHash = "#credit-strategy";
const sustainabilityInvestmentDemoHash = "#sustainability-investment-demo";

const view = {
  start: document.getElementById("start-view"),
  report: document.getElementById("report-view"),
  admin: document.getElementById("admin-view"),
  strategy: document.getElementById("credit-strategy-view"),
  status: document.getElementById("start-status"),
  selectedFile: document.getElementById("selected-file"),
  uploadButton: document.getElementById("upload-preview-button"),
  retryButton: document.getElementById("retry-analysis-button"),
  cancelButton: document.getElementById("cancel-analysis-button"),
};

const fields = {
  loanSize: document.getElementById("loan-size"),
  tenor: document.getElementById("tenor"),
  baseMargin: document.getElementById("base-margin"),
  ratchetBest: document.getElementById("ratchet-best"),
  ratchetWorst: document.getElementById("ratchet-worst"),
};

const ids = [
  "company-label",
  "company-subtitle",
  "generated-date",
  "verdict-title",
  "verdict-copy",
  "overall-readiness",
  "readiness-band",
  "net-saving-range",
  "deal-summary",
  "cost-range",
  "breakeven-range",
  "regular-loan-size",
  "regular-margin",
  "regular-tenor",
  "regular-outlay",
  "sll-loan-size",
  "sll-margin",
  "sll-ratchet",
  "sll-tenor",
  "best-exec-cost",
  "best-total-outlay",
  "best-case-label",
  "best-regular",
  "best-sll-interest",
  "best-exec",
  "best-net",
  "best-formula",
  "worst-case-label",
  "worst-regular",
  "worst-sll-interest",
  "worst-exec",
  "worst-net",
  "worst-formula",
  "base-margin-note",
  "report-footer",
  "analysis-scope",
  "investment-thesis",
];

const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

function enrichReport(report) {
  const componentsByKey = Object.fromEntries(
    Object.entries(report.modelInputs.componentsByKey).map(([key, component]) => {
      const citations = validCitations(component.citations);
      if (citations.length > 0) return [key, { ...component, citations }];
      return [key, { ...component, score: null, maturity: "absent", status: "Insufficient evidence", citations: [] }];
    }),
  );
  const isAssessed = Object.values(componentsByKey).every((component) => component.citations.length > 0);
  const analysis = {
    ...report.analysis,
    kpis: report.analysis.kpis.map((kpi) => {
      const citations = validCitations(kpi.citations);
      return citations.length > 0
        ? { ...kpi, citations }
        : { ...kpi, status: "Insufficient evidence", evidence: "Insufficient cited evidence to assess this KPI candidate.", citations: [] };
    }),
    gaps: report.analysis.gaps.filter((gap) => validCitations(gap.citations).length > 0).map((gap) => ({ ...gap, citations: validCitations(gap.citations) })),
    sustainabilityInvestments: normalizeSustainabilityInvestmentAnalysis(report.analysis.sustainabilityInvestments),
    sustainabilityProfile: normalizeSustainabilityProfile(report.analysis.sustainabilityProfile, {
      company: report.company,
      investmentAnalysis: report.analysis.sustainabilityInvestments,
    }),
  };
  const modelInputs = {
    ...report.modelInputs,
    componentsByKey,
    assessmentState: isAssessed ? "assessed" : "insufficient_evidence",
  };
  const scoring = weightedReadinessFromScores(componentsByKey);
  const executionCost = calculateExecutionCost({
    readinessBand: scoring.band,
    kpiCount: modelInputs.recommendedKpiCount,
    tenor: report.dealDefaults.tenor,
    hasLowConfidence: modelInputs.hasLowConfidence,
    options: {
      bestCaseSetupFloors: modelInputs.bestCaseSetupFloors,
      worstCaseExcludedDrivers: modelInputs.worstCaseExcludedDrivers,
    },
  });

  return {
    ...report,
    modelInputs,
    analysis: {
      ...analysis,
      readinessScore: scoring.score100,
      readinessBand: readinessBandLabel(scoring.band),
      executionCost,
      components: Object.values(componentsByKey),
      scoring,
      assessmentState: modelInputs.assessmentState,
    },
  };
}

function validCitations(citations = []) {
  return citations.filter((citation) => citation?.quote && Array.isArray(citation.pages) && citation.pages.length > 0);
}

function readInputs() {
  const loanSizeM = clamp(Number(fields.loanSize.value), 1, 100000);
  const tenor = clamp(Number(fields.tenor.value), 1, 30);
  const baseMargin = clamp(Number(fields.baseMargin.value), 1, 1000);
  const ratchetBest = clamp(Number(fields.ratchetBest.value), 0, 15);
  const ratchetWorst = clamp(Number(fields.ratchetWorst.value), 0, 15);

  return {
    loanSize: loanSizeM * 1_000_000,
    loanSizeM,
    tenor,
    baseMargin,
    ratchetBest: Math.max(ratchetBest, ratchetWorst),
    ratchetWorst: Math.min(ratchetBest, ratchetWorst),
  };
}

function setDealDefaults(report) {
  fields.loanSize.value = report.dealDefaults.loanSizeM;
  fields.tenor.value = report.dealDefaults.tenor;
  fields.baseMargin.value = report.dealDefaults.baseMargin;
  fields.ratchetBest.value = report.dealDefaults.ratchetBest;
  fields.ratchetWorst.value = report.dealDefaults.ratchetWorst;
}

function renderReportMeta(report) {
  els["company-label"].textContent = report.company.label;
  els["company-subtitle"].textContent = report.company.subtitle;
  els["generated-date"].textContent = report.company.generatedDate;
  els["verdict-title"].textContent = report.verdict.title;
  els["verdict-copy"].textContent = report.verdict.copy;
  const isAssessed = report.analysis.assessmentState === "assessed";
  els["overall-readiness"].textContent = isAssessed ? `${report.analysis.readinessScore} / 100` : "Not assessed";
  els["readiness-band"].textContent = isAssessed ? report.analysis.readinessBand : "Insufficient cited evidence";
  els["base-margin-note"].textContent = report.analysis.baseMarginNote;
  els["report-footer"].textContent = report.company.footer;
  renderAnalysisScope(report.analysis.analysisScope);
}

function renderAnalysisScope(scope) {
  if (!scope) {
    els["analysis-scope"].classList.add("is-hidden");
    return;
  }
  els["analysis-scope"].classList.remove("is-hidden");
  if (scope.fullCoverage) {
    els["analysis-scope"].textContent = `Analysis coverage: all ${scope.analyzedPageCount} unique PDF pages were assessed.`;
    return;
  }
  const metadataNote = scope.metadataOnlyPages?.length ? ` Page ${formatPageRanges(scope.metadataOnlyPages)} was used only for document identification, not evidence scoring.` : "";
  els["analysis-scope"].textContent = `Analysis coverage: assessed pages ${formatPageRanges(scope.analyzedPages)}. Skipped and not assessed: ${formatPageRanges(scope.skippedPages)}.${metadataNote} Selection rule: ${scope.selectionRule ?? "not available"}`;
}

function formatPageRanges(pages = []) {
  if (!pages.length) return "none";
  const ranges = [];
  let start = pages[0];
  let previous = pages[0];
  for (const page of pages.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}–${previous}`);
    start = page;
    previous = page;
  }
  ranges.push(start === previous ? `${start}` : `${start}–${previous}`);
  return ranges.join(", ");
}

function renderComponents(report) {
  const container = document.getElementById("component-list");
  container.innerHTML = report.analysis.components
    .map(
      (component) => `
        <div class="component-row">
          <div class="component-name">${escapeHtml(component.name)}</div>
          <div class="component-score">${component.score === null ? "—" : `${component.score}%`}</div>
          <div class="component-status">${escapeHtml(component.status)}</div>
          <div class="bar" aria-label="${escapeHtml(component.name)} score ${component.score ?? "not assessed"}">
            <span style="width: ${component.score ?? 0}%"></span>
          </div>
          ${renderCitations(component.citations)}
        </div>
      `,
    )
    .join("");
}

function renderKpis(report) {
  const container = document.getElementById("kpi-list");
  container.innerHTML = report.analysis.kpis
    .map((kpi) => {
      const statusClass = kpi.status.toLowerCase() === "ready" ? "status-ready" : kpi.status.toLowerCase() === "partial" ? "status-partial" : "status-insufficient";
      return `
        <div class="kpi-item">
          <div>
            <h3>${escapeHtml(kpi.name)}</h3>
            <p>${escapeHtml(kpi.evidence)}</p>
            ${renderCitations(kpi.citations)}
          </div>
          <span class="status-badge ${statusClass}">${escapeHtml(kpi.status)}</span>
        </div>
      `;
    })
    .join("");
}

function renderGaps(report) {
  const container = document.getElementById("gap-list");
  if (report.analysis.gaps.length === 0) {
    container.innerHTML = '<p class="abstention-copy">No evidence-backed gaps were identified. This does not confirm SLL readiness; uncited matters are withheld rather than guessed.</p>';
    return;
  }
  container.innerHTML = report.analysis.gaps
    .map((gap) => {
      const severityClass = gap.severity.toLowerCase() === "low" ? "severity-low" : "severity-medium";
      return `
        <div class="gap-item">
          <div>
            <h3>${escapeHtml(gap.title)}</h3>
            <p>${escapeHtml(gap.description)}</p>
            ${renderCitations(gap.citations)}
          </div>
          <span class="severity-badge ${severityClass}">${escapeHtml(gap.severity)}</span>
        </div>
      `;
    })
    .join("");
}

function renderSustainabilityInvestments(report) {
  const profile = report.analysis.sustainabilityProfile;
  const legacy = report.analysis.sustainabilityInvestments;
  const evidenceCount = profile.evidenceCount || legacy.items.reduce((total, item) => total + item.citations.length, 0);
  document.getElementById("credit-strategy-evidence-summary").textContent = evidenceCount
    ? `${evidenceCount} cited climate-capital evidence item${evidenceCount === 1 ? "" : "s"} detected. Missing commercial inputs can be confirmed in the decision brief.`
    : "No cited climate-capital evidence was detected; the decision brief will show the information required before sourcing.";
  els["investment-thesis"].textContent = legacy.carbonCreditThesis;
}

async function generateSustainabilityAnalysis() {
  const button = document.getElementById("generate-sustainability-button");
  const sectorOverride = document.getElementById("sustainability-sector").value;
  button.disabled = true;
  button.textContent = "Generating...";
  setSustainabilityStatus("Preparing the cited evidence profile and benchmark comparison...");
  document.getElementById("retry-sustainability-button").classList.add("is-hidden");

  try {
    let result;
    if (activeReportSource) {
      const response = await sustainabilityJobRequest(
        `/api/extraction-jobs/${encodeURIComponent(activeReportSource.jobId)}/sustainability-analyses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectorOverride }),
        },
      );
      const payload = await safeReadJson(response);
      if (!response.ok || !payload.ok || !payload.job) throw new Error(payload.message || "Unable to start sustainability analysis.");
      activeSustainabilityJob = payload.job;
      document.getElementById("cancel-sustainability-button").classList.remove("is-hidden");
      const job = await pollSustainabilityJob(payload.job);
      if (!job.result) {
        const error = new Error(job.error || "Sustainability analysis did not return a result.");
        error.job = job;
        throw error;
      }
      result = job.result;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 0));
      result = buildSustainabilityAnalysis(activeReport.analysis.sustainabilityProfile, { sectorOverride });
    }
    activeSustainabilityAnalysis = result;
    renderDeepSustainabilityAnalysis(result);
    setSustainabilityStatus(result.benchmark.comparablePeerCount >= 3 ? "Analysis completed with a comparable peer benchmark." : "Analysis completed with a limited peer reference; unavailable figures were withheld.");
  } catch (error) {
    console.error(error);
    setSustainabilityStatus(error.message, "error");
    document.getElementById("retry-sustainability-button").classList.remove("is-hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Generate Sustainability Investment Analysis";
    document.getElementById("cancel-sustainability-button").classList.add("is-hidden");
  }
}

async function pollSustainabilityJob(initialJob) {
  let job = initialJob;
  while (["queued", "processing"].includes(job.status)) {
    activeSustainabilityJob = job;
    setSustainabilityStatus(job.stage);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = await sustainabilityJobRequest(`/api/sustainability-analyses/${encodeURIComponent(job.id)}`);
    const payload = await safeReadJson(response);
    if (!response.ok || !payload.ok || !payload.job) throw new Error(payload.message || "Unable to read sustainability analysis progress.");
    job = payload.job;
  }
  activeSustainabilityJob = job;
  return job;
}

async function cancelSustainabilityAnalysis() {
  if (!activeSustainabilityJob || !activeReportSource) return;
  const response = await sustainabilityJobRequest(`/api/sustainability-analyses/${encodeURIComponent(activeSustainabilityJob.id)}/cancel`, { method: "POST" });
  const payload = await safeReadJson(response);
  if (!response.ok || !payload.ok) {
    setSustainabilityStatus(payload.message || "Unable to cancel sustainability analysis.", "error");
    return;
  }
  activeSustainabilityJob = payload.job;
  setSustainabilityStatus("Sustainability analysis cancelled.");
  document.getElementById("cancel-sustainability-button").classList.add("is-hidden");
}

function rerenderSustainabilityScenario() {
  if (!activeSustainabilityAnalysis) return;
  const sectorOverride = document.getElementById("sustainability-sector").value;
  const scenario = document.getElementById("sustainability-scenario").value;
  const startYear = Number(document.getElementById("sustainability-start-year").value);
  const budgetValue = document.getElementById("sustainability-budget").value;
  activeSustainabilityAnalysis = buildSustainabilityAnalysis(activeReport.analysis.sustainabilityProfile, {
    sectorOverride,
    scenario,
    startYear,
    budgetCapUsd: budgetValue === "" ? null : Number(budgetValue),
  });
  renderDeepSustainabilityAnalysis(activeSustainabilityAnalysis, { preserveControls: true });
}

function renderDeepSustainabilityAnalysis(analysis, { preserveControls = false } = {}) {
  document.getElementById("sustainability-results").classList.remove("is-hidden");
  document.getElementById("sustainability-generate-panel").classList.add("is-hidden");
  document.getElementById("sustainability-data-date").textContent = `Benchmark ${analysis.benchmark.asOfDate}`;
  document.getElementById("sustainability-overall").textContent = analysis.ratings.overall;
  document.getElementById("sustainability-internal-rating").textContent = trackLabel(analysis.ratings.internalInvestment);
  document.getElementById("sustainability-carbon-rating").textContent = trackLabel(analysis.ratings.carbonPortfolio);
  document.getElementById("sustainability-confidence").textContent = analysis.ratings.disclosureConfidence;
  document.getElementById("peer-confidence-label").textContent = `${analysis.benchmark.confidence} · ${analysis.benchmark.comparablePeerCount}/${analysis.benchmark.peerCount} comparable peers`;
  if (!preserveControls) {
    document.getElementById("sustainability-start-year").value = analysis.purchasePlan.startYear;
    document.getElementById("sustainability-scenario").value = analysis.purchasePlan.scenario;
  }
  renderScoreChart(analysis);
  renderMixChart(analysis);
  renderPurchasePlanChart(analysis);
  renderSustainabilityRecommendations(analysis);
  document.getElementById("sustainability-peer-roster").innerHTML = `<strong>Peer disclosure reviewed</strong><div>${analysis.benchmark.peers.length
    ? analysis.benchmark.peers.map((peer) => `<a href="${escapeHtml(peer.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(peer.name)}</a><span>${peer.comparable ? "Comparable" : "Mix not comparably disclosed"}</span>`).join("")
    : "<span>Market reference only — no sector peer percentile.</span>"}</div>`;
  document.getElementById("sustainability-methodology-note").textContent = analysis.benchmark.methodologyNote;
  document.getElementById("sustainability-sources").innerHTML = analysis.benchmark.sources
    .map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a>`)
    .join(" · ");
}

function renderScoreChart(analysis) {
  const rows = [
    { label: "Internal investment", track: analysis.ratings.internalInvestment },
    { label: "Carbon portfolio", track: analysis.ratings.carbonPortfolio },
  ];
  const compact = window.innerWidth <= 720;
  const width = compact ? 340 : 720;
  const left = compact ? 92 : 150;
  const barWidth = compact ? 190 : 500;
  const svgRows = rows.map((row, index) => {
    const y = 34 + index * 58;
    const score = row.track.score;
    const valueWidth = score === null ? 0 : barWidth * score / 100;
    return `<text x="0" y="${y + 14}" class="chart-label">${escapeHtml(row.label)}</text>
      <rect x="${left}" y="${y}" width="${barWidth}" height="18" rx="2" class="chart-track"></rect>
      ${score === null ? "" : `<rect x="${left}" y="${y}" width="${valueWidth}" height="18" rx="2" class="chart-series-1"></rect>`}
      <line x1="${left + barWidth * 0.65}" x2="${left + barWidth * 0.65}" y1="${y - 5}" y2="${y + 23}" class="chart-threshold"></line>
      <text x="${left + barWidth + 12}" y="${y + 14}" class="chart-value">${score === null ? "N/A" : `${score}`}</text>`;
  }).join("");
  document.getElementById("sustainability-score-chart").innerHTML = `<svg viewBox="0 0 ${width} 145" role="img" aria-labelledby="score-chart-title score-chart-desc"><title id="score-chart-title">Client sustainability scores</title><desc id="score-chart-desc">Internal investment and carbon portfolio scores on a zero to one hundred scale. The reference marker is the aligned threshold at 65. Peer percentile is withheld when fewer than three peers are comparable.</desc>${svgRows}<text x="${left + barWidth * 0.65}" y="140" text-anchor="middle" class="chart-note">65 aligned threshold</text></svg>`;
}

function renderMixChart(analysis) {
  const rows = [
    { label: "Client disclosed", items: analysis.comparisons.clientMix },
    { label: "Peer median", items: analysis.comparisons.peerMix ?? [] },
    { label: "Recommended", items: analysis.comparisons.recommendedMix },
  ];
  const activeCategories = uniqueCategoryKeys(rows.flatMap((row) => row.items ?? []));
  if (!activeCategories.length) {
    document.getElementById("sustainability-mix-chart").innerHTML = '<p class="chart-empty">Portfolio percentages withheld: neither the client nor at least three comparable peers disclosed a complete mix.</p>';
    return;
  }
  const compact = window.innerWidth <= 720;
  const width = compact ? 340 : 720;
  const left = compact ? 92 : 150;
  const barWidth = compact ? 230 : 520;
  const marks = rows.map((row, rowIndex) => {
    const y = 28 + rowIndex * 48;
    let x = left;
    const rects = (row.items ?? []).map((item) => {
      const w = barWidth * item.share / 100;
      const categoryIndex = Math.max(0, activeCategories.indexOf(item.key));
      const rect = `<rect x="${x}" y="${y}" width="${w}" height="22" class="chart-category-${categoryIndex + 1}"><title>${escapeHtml(item.label)}: ${item.share.toFixed(1)}%</title></rect>`;
      x += w;
      return rect;
    }).join("");
    return `<text x="0" y="${y + 16}" class="chart-label">${escapeHtml(row.label)}</text><rect x="${left}" y="${y}" width="${barWidth}" height="22" class="chart-track"></rect>${rects}`;
  }).join("");
  const legend = activeCategories.map((key, index) => {
    const item = rows.flatMap((row) => row.items ?? []).find((entry) => entry.key === key);
    return `<span><i class="legend-swatch chart-category-${index + 1}"></i>${escapeHtml(item?.label ?? key)}</span>`;
  }).join("");
  document.getElementById("sustainability-mix-chart").innerHTML = `<svg viewBox="0 0 ${width} 175" role="img" aria-labelledby="mix-chart-title mix-chart-desc"><title id="mix-chart-title">Carbon-credit portfolio mix comparison</title><desc id="mix-chart-desc">One hundred percent stacked bars compare client disclosure, comparable peer median and the recommended mix. Missing rows indicate insufficient comparable disclosure.</desc>${marks}</svg><div class="chart-legend">${legend}</div>`;
}

function renderPurchasePlanChart(analysis) {
  const plan = analysis.purchasePlan;
  const note = document.getElementById("purchase-plan-note");
  if (!plan.assessable) {
    note.textContent = "Not assessable";
    document.getElementById("sustainability-plan-chart").innerHTML = `<p class="chart-empty">A numeric plan is withheld until these inputs are available: ${escapeHtml(plan.missingInputs.join(", "))}.</p>`;
    return;
  }
  note.textContent = `${plan.scenario.toUpperCase()} coverage · ${plan.priceAvailability}`;
  const maxVolume = Math.max(...plan.years.map((year) => year.volumeTco2e), 1);
  const compact = window.innerWidth <= 720;
  const width = compact ? 340 : 720;
  const chartHeight = 210;
  const baseline = 170;
  const marks = plan.years.map((year, yearIndex) => {
    const x = compact ? 62 + yearIndex * 96 : 145 + yearIndex * 190;
    const totalHeight = 125 * year.volumeTco2e / maxVolume;
    let y = baseline;
    const rects = year.byCategory.map((item, categoryIndex) => {
      const height = totalHeight * item.share / 100;
      y -= height;
      return `<rect x="${x}" y="${y}" width="${compact ? 44 : 72}" height="${height}" class="chart-category-${categoryIndex + 1}"><title>${escapeHtml(item.label)}: ${formatTco2e(item.volumeTco2e)}</title></rect>`;
    }).join("");
    const cost = year.costLowUsd === null ? "Price unavailable" : `${formatUsd(year.costLowUsd)}–${formatUsd(year.costHighUsd)}`;
    const center = x + (compact ? 22 : 36);
    return `${rects}<text x="${center}" y="${baseline + 20}" text-anchor="middle" class="chart-label">${year.year}</text><text x="${center}" y="${Math.max(16, baseline - totalHeight - 10)}" text-anchor="middle" class="chart-value">${compact ? formatCompactTco2e(year.volumeTco2e) : formatTco2e(year.volumeTco2e)}</text><text x="${center}" y="${baseline + 38}" text-anchor="middle" class="chart-note">${escapeHtml(compact && year.costLowUsd !== null ? formatUsd(year.costBaseUsd) : cost)}</text>`;
  }).join("");
  document.getElementById("sustainability-plan-chart").innerHTML = `<svg viewBox="0 0 ${width} ${chartHeight}" role="img" aria-labelledby="plan-chart-title plan-chart-desc"><title id="plan-chart-title">Three-year carbon-credit purchase plan</title><desc id="plan-chart-desc">Stacked bars show planned credit volume by category, annual coverage and sourced cost range. Unsourced prices remain unavailable.</desc><line x1="${compact ? 30 : 80}" x2="${compact ? 330 : 680}" y1="${baseline}" y2="${baseline}" class="chart-axis"></line>${marks}</svg>`;
}

function renderSustainabilityRecommendations(analysis) {
  document.getElementById("sustainability-recommendations").innerHTML = analysis.recommendations.map((item) => `
    <tr>
      <td><span class="recommendation-action action-${item.action.toLowerCase()}">${escapeHtml(item.action)}</span></td>
      <td>${escapeHtml(item.category)}</td>
      <td><p>${escapeHtml(item.rationale)}</p>${renderCitations(item.evidence)}</td>
    </tr>
  `).join("");
}

function setSustainabilityStatus(message, type = "") {
  const element = document.getElementById("sustainability-status");
  element.textContent = message;
  element.className = `status-message${type ? ` ${type}` : ""}`;
}

function sustainabilityJobRequest(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: { ...(options.headers ?? {}), "X-Extraction-Job-Token": activeReportSource?.token ?? "" },
  });
}

function trackLabel(track) {
  return track.score === null ? "Not assessable" : `${track.score} · ${track.band}`;
}

function uniqueCategoryKeys(items) {
  return [...new Set(items.map((item) => item.key).filter(Boolean))].slice(0, 6);
}

function formatTco2e(value) {
  return `${Math.round(value).toLocaleString()} tCO2e`;
}

function formatCompactTco2e(value) {
  const rounded = Math.round(value);
  if (rounded >= 1_000_000) return `${(rounded / 1_000_000).toFixed(1)}Mt`;
  if (rounded >= 1_000) return `${(rounded / 1_000).toFixed(1)}kt`;
  return `${rounded}t`;
}

function formatUsd(value) {
  return `$${Math.round(value).toLocaleString()}`;
}

function renderCitations(citations = []) {
  if (!citations.length) return "";
  return citations
    .map((citation) => `<p class="evidence-citation"><strong>Source:</strong> “${escapeHtml(citation.quote)}” · PDF p. ${citation.pages.join(", ")}</p>`)
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderFrameworkAdmin() {
  document.getElementById("admin-title").textContent = frameworkContent.title;
  document.getElementById("admin-subtitle").textContent = frameworkContent.subtitle;
  document.getElementById("admin-core-idea").textContent = frameworkContent.coreIdea;
  document.getElementById("admin-evidence-rule").textContent = frameworkContent.evidenceRule;
  document.getElementById("admin-extraction-note").textContent = frameworkContent.extractionNote;
  document.getElementById("admin-presenter-sentence").textContent = frameworkContent.presenterSentence;
  document.getElementById("admin-investment-summary").textContent = frameworkContent.investmentLens.summary;
  document.getElementById("admin-investment-version").textContent = `Framework version: ${frameworkContent.investmentLens.frameworkVersion}`;
  document.getElementById("admin-investment-interpretation").textContent = frameworkContent.investmentLens.interpretation;

  document.getElementById("admin-sll-dimensions").innerHTML = frameworkContent.sllDimensions
    .map(
      (dimension) => `
        <tr>
          <th scope="row">${escapeHtml(dimension.label)}</th>
          <td><strong>${escapeHtml(dimension.weightLabel)}</strong></td>
          <td>${escapeHtml(dimension.question)}</td>
          <td>${escapeHtml(dimension.looksFor)}</td>
          <td>${escapeHtml(dimension.example)}</td>
        </tr>
      `,
    )
    .join("");

  document.getElementById("admin-score-explanation").innerHTML = [
    ["Score", frameworkContent.scoreExplanation.summary],
    ["Weighting", frameworkContent.scoreExplanation.weighting],
    ["Interpretation", frameworkContent.scoreExplanation.interpretation],
  ]
    .map(
      ([label, copy]) => `
        <div class="explanation-item">
          <span>${escapeHtml(label)}</span>
          <p>${escapeHtml(copy)}</p>
        </div>
      `,
    )
    .join("");

  document.getElementById("admin-dimension-details").innerHTML = frameworkContent.sllDimensions
    .map(
      (dimension) => `
        <section class="dimension-detail">
          <h3>${escapeHtml(dimension.label)}</h3>
          <p>${escapeHtml(dimension.explanation)}</p>
          <small>${escapeHtml(dimension.weakEvidence)}</small>
        </section>
      `,
    )
    .join("");

  document.getElementById("admin-investment-criteria").innerHTML = frameworkContent.investmentLens.criteria
    .map(
      (criterion) => `
        <tr>
          <th scope="row">${escapeHtml(criterion.label)}</th>
          <td><strong>${escapeHtml(criterion.weightLabel)}</strong></td>
          <td>${escapeHtml(criterion.looksFor)}</td>
          <td>${escapeHtml(criterion.example)}</td>
        </tr>
      `,
    )
    .join("");
}

function showStartView({ clearHash = false } = {}) {
  view.start.classList.remove("is-hidden");
  view.report.classList.add("is-hidden");
  view.admin.classList.add("is-hidden");
  view.strategy.classList.add("is-hidden");
  if (clearHash && window.location.hash) {
    history.pushState("", document.title, window.location.pathname + window.location.search);
  }
}

function showAdminView() {
  view.start.classList.add("is-hidden");
  view.report.classList.add("is-hidden");
  view.admin.classList.remove("is-hidden");
  view.strategy.classList.add("is-hidden");
}

function routeFromHash() {
  if (window.location.hash === "#framework-admin") {
    showAdminView();
    return true;
  }

  if (window.location.hash === sustainabilityInvestmentDemoHash) {
    showCreditStrategyView({ precomputedDemo: true, returnView: "start" });
    return true;
  }

  if (window.location.hash === creditStrategyHash) {
    showCreditStrategyView({ returnView: "start" });
    return true;
  }

  if (!view.admin.classList.contains("is-hidden") || !view.strategy.classList.contains("is-hidden")) {
    if (!view.strategy.classList.contains("is-hidden") && creditStrategyReturnView === "report") {
      view.strategy.classList.add("is-hidden");
      view.report.classList.remove("is-hidden");
    } else {
      showStartView();
    }
  }
  return false;
}

function setUploadStatus(message, tone = "neutral") {
  view.status.textContent = message;
  view.status.dataset.tone = tone;
}

function netSavingDollars(value) {
  return value < 0 ? `-${dollars(Math.abs(value))}` : dollars(value);
}

function updateCalculations() {
  const inputs = readInputs();
  const executionCost = activeReport.analysis.executionCost;
  const best = calculateScenario(inputs, inputs.ratchetBest, executionCost.best);
  const worst = calculateScenario(inputs, inputs.ratchetWorst, executionCost.worst);
  const reducedMargin = Math.max(inputs.baseMargin - inputs.ratchetBest, 0);

  els["net-saving-range"].textContent = `${netSavingDollars(worst.netSaving)} -> ${netSavingDollars(best.netSaving)}`;
  els["deal-summary"].textContent = `USD $${inputs.loanSizeM.toLocaleString()}M - ${inputs.tenor}yr - ${inputs.baseMargin}bps base - ${inputs.ratchetWorst}-${inputs.ratchetBest}bps ratchet`;
  els["cost-range"].textContent = `${dollars(executionCost.best)} - ${dollars(executionCost.worst)}`;
  els["breakeven-range"].textContent = `${best.breakevenBps.toFixed(1)} - ${worst.breakevenBps.toFixed(1)} bps`;

  els["regular-loan-size"].textContent = loanMillions(inputs.loanSizeM);
  els["regular-margin"].textContent = `${inputs.baseMargin} bps`;
  els["regular-tenor"].textContent = `${inputs.tenor} yrs`;
  els["regular-outlay"].textContent = dollars(best.regularInterest);

  els["sll-loan-size"].textContent = loanMillions(inputs.loanSizeM);
  els["sll-margin"].textContent = `${reducedMargin} bps`;
  els["sll-ratchet"].textContent = `(-${inputs.ratchetBest})`;
  els["sll-tenor"].textContent = `${inputs.tenor} yrs`;
  els["best-exec-cost"].textContent = dollars(executionCost.best);
  els["best-total-outlay"].textContent = dollars(best.totalOutlay);

  els["best-case-label"].textContent = `Best Case - ${inputs.ratchetBest}bps`;
  els["best-regular"].textContent = dollars(best.regularInterest);
  els["best-sll-interest"].textContent = dollars(best.sllInterest);
  els["best-exec"].textContent = dollars(executionCost.best);
  els["best-net"].textContent = signedDollars(best.netSaving);
  els["best-formula"].textContent = `${dollars(best.regularInterest)} - ${dollars(best.sllInterest)} - ${dollars(executionCost.best)}`;

  els["worst-case-label"].textContent = `Worst Case - ${inputs.ratchetWorst}bps`;
  els["worst-regular"].textContent = dollars(worst.regularInterest);
  els["worst-sll-interest"].textContent = dollars(worst.sllInterest);
  els["worst-exec"].textContent = dollars(executionCost.worst);
  els["worst-net"].textContent = signedDollars(worst.netSaving);
  els["worst-formula"].textContent = `${dollars(worst.regularInterest)} - ${dollars(worst.sllInterest)} - ${dollars(executionCost.worst)}`;
}

function showReport(report, statusMessage, { sourceJob = null } = {}) {
  activeReportSource = sourceJob;
  activeReport = enrichReport(report);
  setDealDefaults(activeReport);
  renderReportMeta(activeReport);
  renderComponents(activeReport);
  renderKpis(activeReport);
  renderGaps(activeReport);
  renderSustainabilityInvestments(activeReport);
  updateCalculations();
  document.getElementById("open-credit-strategy-demo-button").classList.toggle("is-hidden", activeReport.company.label !== "TSMC");

  view.start.classList.add("is-hidden");
  view.report.classList.remove("is-hidden");
  view.admin.classList.add("is-hidden");
  view.strategy.classList.add("is-hidden");
  setUploadStatus(statusMessage);
}

function handleUploadSelection(event) {
  const file = event.target.files?.[0];
  selectedUpload = file ?? null;

  if (!file) {
    view.selectedFile.textContent =
      "Upload a text-based PDF up to 20MB. Scanned/image-only reports are flagged before analysis.";
    view.uploadButton.disabled = true;
    setUploadStatus("Demo mode uses the AIIB fixture from the handoff package.");
    return;
  }

  view.selectedFile.textContent = `${file.name} selected (${(file.size / 1024 / 1024).toFixed(2)}MB).`;
  view.uploadButton.disabled = false;
  hideRetry();
  setUploadStatus("File selected. Click Analyze Uploaded PDF to validate and run first-pass extraction.");
}

async function handleUploadedPreview() {
  if (isExtracting) return;

  if (!selectedUpload) {
    setUploadStatus("Choose a PDF first, or use Try AIIB Demo.", "error");
    return;
  }

  const previewButton = view.uploadButton;
  isExtracting = true;
  previewButton.disabled = true;
  previewButton.textContent = "Extracting...";
  setUploadStatus("Validating PDF and extracting text in the browser...");

  try {
    const pdfResult = await extractPdfText(selectedUpload);

    if (!pdfResult.ok) {
      setUploadStatus(pdfResult.message, "error");
      return;
    }

    setUploadStatus(`Extracted ${pdfResult.metadata.extractedCharCount.toLocaleString()} characters. Creating AI analysis job...`);

    const extractionResult = await extractUploadedReport(pdfResult);
    const extraction = extractionResult.extraction;
    const validation = validateSllExtractionJson(extraction);

    if (!validation.ok) {
      setUploadStatus(`Extraction JSON is incomplete: ${validation.missing.join(", ")}`, "error");
      return;
    }

    const uploadedReport = mapExtractionToReport(extraction);
    showReport(
      uploadedReport,
      `${extractionResult.statusMessage} ${pdfResult.metadata.extractedCharCount.toLocaleString()} characters analyzed.`,
      { sourceJob: extractionResult.sourceJob },
    );
  } catch (error) {
    console.error(error);
    if (error.job?.status === "cancelled") {
      setUploadStatus("AI analysis cancelled.");
    } else if (error.job?.status === "capacity_exhausted") {
      pendingExtractionJob = error.job;
      showRetry();
      setUploadStatus(capacityMessage(error.job), "error");
    } else {
      setUploadStatus("AI analysis failed before a completed result was available.", "error");
    }
  } finally {
    isExtracting = false;
    activeExtractionJob = null;
    hideCancel();
    previewButton.disabled = false;
    previewButton.textContent = "Analyze Uploaded PDF";
  }
}

async function extractUploadedReport(pdfResult) {
  const aiResponse = await fetch("/api/extraction-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: pdfResult.text, metadata: pdfResult.metadata }),
  });
  const payload = await safeReadJson(aiResponse);
  if (!aiResponse.ok || !payload.ok || !payload.job || !payload.jobToken) {
    throw new Error(payload.message || `AI extraction failed with ${aiResponse.status}`);
  }

  saveJobToken(payload.job.id, payload.jobToken);
  activeExtractionJob = payload.job;
  showCancel();
  const completedJob = await pollExtractionJob(payload.job);
  if (!completedJob.result?.extraction) {
    const error = new Error(completedJob.error || "AI extraction did not return structured JSON.");
    error.job = completedJob;
    throw error;
  }

  return {
    extraction: completedJob.result.extraction,
    statusMessage: completedJob.cacheHit ? "AI extraction loaded from cache." : "AI extraction completed.",
    sourceJob: { jobId: completedJob.id, token: loadJobToken(completedJob.id) },
  };
}

async function pollExtractionJob(initialJob) {
  let job = initialJob;

  while (job.status === "queued" || job.status === "processing" || job.status === "merging") {
    activeExtractionJob = job;
    showCancel();
    setUploadStatus(`${job.stage} (${job.progress.completed} / ${job.progress.total})`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const response = await authorizedJobRequest(`/api/extraction-jobs/${encodeURIComponent(job.id)}`);
    const payload = await safeReadJson(response);
    if (!response.ok || !payload.ok || !payload.job) throw new Error(payload.message || "Unable to read extraction progress.");
    job = payload.job;
  }

  return job;
}

async function cancelActiveAnalysis() {
  if (!activeExtractionJob) return;
  view.cancelButton.disabled = true;
  try {
    const response = await authorizedJobRequest(`/api/extraction-jobs/${encodeURIComponent(activeExtractionJob.id)}/cancel`, { method: "POST" });
    const payload = await safeReadJson(response);
    if (!response.ok || !payload.ok || !payload.job) throw new Error(payload.message || "Unable to cancel AI analysis.");
    activeExtractionJob = null;
    hideCancel();
    setUploadStatus("AI analysis cancelled.");
  } catch (error) {
    setUploadStatus(error.message, "error");
  } finally {
    view.cancelButton.disabled = false;
  }
}

async function retryPendingAnalysis() {
  if (!pendingExtractionJob || isExtracting) return;
  isExtracting = true;
  view.retryButton.disabled = true;
  setUploadStatus("Retrying unfinished AI sections...");

  try {
    const response = await authorizedJobRequest(`/api/extraction-jobs/${encodeURIComponent(pendingExtractionJob.id)}/retry`, {
      method: "POST",
    });
    const payload = await safeReadJson(response);
    if (!response.ok || !payload.ok || !payload.job) throw new Error(payload.message || "Unable to retry AI analysis.");
    const completedJob = await pollExtractionJob(payload.job);
    if (!completedJob.result?.extraction) {
      const error = new Error(completedJob.error || "AI analysis remains unavailable.");
      error.job = completedJob;
      throw error;
    }
    pendingExtractionJob = null;
    hideRetry();
    showReport(mapExtractionToReport(completedJob.result.extraction), "AI extraction completed after retry.", {
      sourceJob: { jobId: completedJob.id, token: loadJobToken(completedJob.id) },
    });
  } catch (error) {
    if (error.job?.status === "capacity_exhausted") pendingExtractionJob = error.job;
    setUploadStatus(error.job?.status === "capacity_exhausted" ? capacityMessage(error.job) : error.message, "error");
  } finally {
    isExtracting = false;
    view.retryButton.disabled = false;
  }
}

function authorizedJobRequest(path, options = {}) {
  const jobId = path.split("/")[3];
  const token = loadJobToken(jobId);
  return fetch(path, {
    ...options,
    headers: { ...(options.headers ?? {}), "X-Extraction-Job-Token": token ?? "" },
  });
}

function saveJobToken(jobId, token) {
  sessionStorage.setItem(`sll-job-token:${jobId}`, token);
  sessionStorage.setItem("sll-active-job-id", jobId);
}

function loadJobToken(jobId) {
  return sessionStorage.getItem(`sll-job-token:${jobId}`);
}

function clearJobToken(jobId) {
  sessionStorage.removeItem(`sll-job-token:${jobId}`);
  if (sessionStorage.getItem("sll-active-job-id") === jobId) sessionStorage.removeItem("sll-active-job-id");
}

function showRetry() {
  view.retryButton.classList.remove("is-hidden");
}

function hideRetry() {
  view.retryButton.classList.add("is-hidden");
}

function showCancel() {
  view.cancelButton.classList.remove("is-hidden");
}

function hideCancel() {
  view.cancelButton.classList.add("is-hidden");
}

async function restoreActiveJob() {
  const jobId = sessionStorage.getItem("sll-active-job-id");
  if (!jobId || !loadJobToken(jobId)) return;

  try {
    const response = await authorizedJobRequest(`/api/extraction-jobs/${encodeURIComponent(jobId)}`);
    const payload = await safeReadJson(response);
    if (!response.ok || !payload.ok || !payload.job) {
      clearJobToken(jobId);
      return;
    }

    let job = payload.job;
    if (job.status === "queued" || job.status === "processing" || job.status === "merging") {
      isExtracting = true;
      job = await pollExtractionJob(job);
    }

    if (job.status === "completed" && job.result?.extraction) {
      showReport(mapExtractionToReport(job.result.extraction), "Recovered completed AI extraction.", {
        sourceJob: { jobId: job.id, token: loadJobToken(job.id) },
      });
      return;
    }

    if (["queued", "processing", "merging"].includes(job.status)) {
      activeExtractionJob = job;
      showCancel();
    }

    if (job.status === "capacity_exhausted") {
      pendingExtractionJob = job;
      showRetry();
      setUploadStatus(capacityMessage(job), "error");
    }
  } catch (error) {
    console.error("Unable to restore AI extraction job:", error);
  } finally {
    isExtracting = false;
  }
}

function capacityMessage(job) {
  const details = job?.failureDetails ?? [];
  if (!details.length) return "AI capacity is currently exhausted. Retry will continue only the unfinished sections.";
  return `AI providers could not complete the analysis: ${details.map((detail) => `section ${detail.section}: ${detail.message}`).join(" | ")}`;
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function showCreditStrategyView({ precomputedDemo = false, returnView = "report" } = {}) {
  view.start.classList.add("is-hidden");
  view.report.classList.add("is-hidden");
  view.admin.classList.add("is-hidden");
  view.strategy.classList.remove("is-hidden");
  creditStrategyReturnView = returnView;
  activeCreditDemo = precomputedDemo ? tsmcCreditStrategyFixture : null;
  document.getElementById("strategy-back-button").textContent = returnView === "report" ? "Back to TSMC report" : "Back to home";
  const source = precomputedDemo
    ? {
        company: tsmcCreditStrategyFixture.result.company,
        evidenceProfile: tsmcCreditStrategyFixture.result.evidenceProfile,
        questionnaire: tsmcCreditStrategyFixture.result.questionnaire,
      }
    : {
        company: activeReport?.company?.label ?? "Company",
        evidenceProfile: creditEvidenceFromReport(activeReport?.analysis?.sustainabilityProfile ?? {}),
        questionnaire: defaultCreditQuestionnaire(activeReport?.analysis?.sustainabilityProfile ?? {}),
      };
  activeCreditCompany = source.company;
  activeCreditEvidence = source.evidenceProfile;
  document.getElementById("strategy-assumptions").open = !precomputedDemo;
  document.getElementById("strategy-company").textContent = source.company;
  populateCreditQuestionnaire(source.questionnaire);
  document.getElementById("strategy-questionnaire-copy").textContent = precomputedDemo
    ? "The report evidence has already been reviewed. Changes below update the cost comparison on this page without using AI."
    : "Report evidence is prefilled where available. Confirmed values drive deterministic calculations.";
  document.getElementById("generate-credit-strategy-button").textContent = precomputedDemo ? "Recalculate Scenario" : "Generate Decision Brief";
  document.getElementById("credit-strategy-status").textContent = precomputedDemo
    ? "Precomputed demo — no live AI request."
    : "Confirm the planning inputs before generating.";
  if (precomputedDemo) {
    activeCreditStrategyAnalysis = tsmcCreditStrategyFixture.result;
    renderCreditStrategyAnalysis(activeCreditStrategyAnalysis);
  } else {
    activeCreditStrategyAnalysis = null;
    document.getElementById("credit-strategy-summary").classList.add("is-hidden");
    document.getElementById("credit-strategy-results").classList.add("is-hidden");
  }
}

function creditEvidenceFromReport(profile) {
  return {
    sector: "semiconductors",
    emissions: {
      ...profile.emissions,
      targetBoundaryTco2e: profile.emissions?.totalTco2e,
    },
    target: profile.target ?? {},
    projects: (profile.internalInvestments ?? []).map((project) => ({
      ...project,
      lever: project.category,
      requiredCapitalUsd: project.requiredCapitalUsd,
      committedCapitalUsd: project.committedCapitalUsd ?? project.amountUsd,
      deliveryYear: project.deliveryYear,
      mrvReady: project.mrvReady ?? project.verified,
      sourceCoverage: 0.5,
    })),
    currentPortfolio: { disclosureStatus: profile.carbonCredits?.disclosureStatus ?? "not_disclosed", credits: profile.carbonCredits?.credits ?? [], citations: profile.carbonCredits?.citations ?? [] },
  };
}

function defaultCreditQuestionnaire(profile) {
  const volume = profile.carbonCredits?.retiredTco2e ?? profile.carbonCredits?.contractedTco2e ?? profile.carbonCredits?.purchasedTco2e;
  return {
    confirmedBoundary: Boolean(profile.emissions?.year && profile.target?.targetYear),
    publicClaimPlanned: Boolean(profile.carbonCredits?.claimMade),
    useYear: Math.max(new Date().getUTCFullYear() + 1, Number(profile.target?.targetYear ?? new Date().getUTCFullYear() + 2)),
    annualBudgetUsd: null,
    riskAppetite: "balanced",
    maxUpfrontPercent: 30,
    costOfCapitalPercent: 8,
    demandVolumeTco2e: volume,
    demandConfidence: volume !== null && volume !== undefined ? "Medium" : "Low",
  };
}

function populateCreditQuestionnaire(answers) {
  document.getElementById("strategy-boundary").checked = Boolean(answers.confirmedBoundary);
  document.getElementById("strategy-public-claim").checked = Boolean(answers.publicClaimPlanned);
  document.getElementById("strategy-use-year").value = answers.useYear ?? new Date().getUTCFullYear() + 2;
  document.getElementById("strategy-demand-volume").value = answers.demandVolumeTco2e ?? "";
  document.getElementById("strategy-demand-confidence").value = answers.demandConfidence ?? "Low";
  document.getElementById("strategy-budget").value = answers.annualBudgetUsd ?? "";
  document.getElementById("strategy-risk").value = answers.riskAppetite ?? "balanced";
  document.getElementById("strategy-upfront").value = answers.maxUpfrontPercent ?? 30;
  document.getElementById("strategy-cost-capital").value = answers.costOfCapitalPercent ?? 8;
}

function readCreditQuestionnaire() {
  const numeric = (id) => {
    const value = document.getElementById(id).value;
    return value === "" ? null : Number(value);
  };
  return {
    confirmedBoundary: document.getElementById("strategy-boundary").checked,
    publicClaimPlanned: document.getElementById("strategy-public-claim").checked,
    useYear: numeric("strategy-use-year"),
    demandVolumeTco2e: numeric("strategy-demand-volume"),
    demandConfidence: document.getElementById("strategy-demand-confidence").value,
    annualBudgetUsd: numeric("strategy-budget"),
    riskAppetite: document.getElementById("strategy-risk").value,
    maxUpfrontPercent: numeric("strategy-upfront"),
    costOfCapitalPercent: numeric("strategy-cost-capital"),
  };
}

async function generateCreditStrategyAnalysis() {
  const button = document.getElementById("generate-credit-strategy-button");
  const status = document.getElementById("credit-strategy-status");
  const questionnaire = readCreditQuestionnaire();
  button.disabled = true;
  button.textContent = "Generating...";
  status.textContent = "Mapping cited evidence and calculating the decision brief...";
  try {
    let result;
    if (activeCreditDemo) {
      result = buildCreditStrategyAnalysis({
        company: activeCreditCompany,
        evidenceProfile: activeCreditEvidence,
        questionnaire,
        startYear: activeCreditDemo.input.startYear,
      });
    } else if (activeReportSource) {
      const response = await sustainabilityJobRequest(
        `/api/extraction-jobs/${encodeURIComponent(activeReportSource.jobId)}/credit-strategy-analyses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionnaire }),
        },
      );
      const payload = await safeReadJson(response);
      if (!response.ok || !payload.ok || !payload.job) throw new Error(payload.message || "Unable to start credit strategy analysis.");
      const job = await pollCreditStrategyJob(payload.job);
      if (!job.result) throw new Error(job.error || "Credit strategy analysis did not return a result.");
      result = job.result;
    } else {
      result = buildCreditStrategyAnalysis({ company: activeCreditCompany, evidenceProfile: activeCreditEvidence, questionnaire });
    }
    activeCreditStrategyAnalysis = result;
    renderCreditStrategyAnalysis(result);
    status.textContent = activeCreditDemo
      ? "Scenario recalculated on this page — no live AI request."
      : result.aiEnrichment?.fallback ? "Completed with deterministic fallback." : "Decision brief completed.";
  } catch (error) {
    console.error(error);
    status.textContent = error.message;
    status.dataset.tone = "error";
  } finally {
    button.disabled = false;
    button.textContent = activeCreditDemo ? "Recalculate Scenario" : "Generate Decision Brief";
  }
}

async function pollCreditStrategyJob(initialJob) {
  let job = initialJob;
  while (["queued", "processing"].includes(job.status)) {
    document.getElementById("credit-strategy-status").textContent = job.stage;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = await sustainabilityJobRequest(`/api/credit-strategy-analyses/${encodeURIComponent(job.id)}`);
    const payload = await safeReadJson(response);
    if (!response.ok || !payload.ok || !payload.job) throw new Error(payload.message || "Unable to read credit strategy progress.");
    job = payload.job;
  }
  return job;
}

function rerenderCreditStrategyLocally() {
  if (!activeCreditStrategyAnalysis || !activeCreditEvidence) return;
  activeCreditStrategyAnalysis = buildCreditStrategyAnalysis({
    company: activeCreditCompany,
    evidenceProfile: activeCreditStrategyAnalysis.evidenceProfile ?? activeCreditEvidence,
    questionnaire: readCreditQuestionnaire(),
    ...(activeCreditDemo ? { startYear: activeCreditDemo.input.startYear } : {}),
  });
  renderCreditStrategyAnalysis(activeCreditStrategyAnalysis);
  document.getElementById("credit-strategy-status").textContent = activeCreditDemo
    ? "Scenario recalculated on this page — no live AI request."
    : "Financial assumptions recalculated without an AI request.";
}

function renderCreditStrategyAnalysis(analysis) {
  document.getElementById("credit-strategy-summary").classList.remove("is-hidden");
  document.getElementById("credit-strategy-results").classList.remove("is-hidden");
  const banner = document.getElementById("strategy-assumption-banner");
  banner.classList.toggle("is-precomputed", Boolean(activeCreditDemo));
  banner.textContent = activeCreditDemo
    ? "Precomputed demo — no live AI request. Example assumptions only — not a price quote."
    : analysis.market.disclaimer;
  document.getElementById("strategy-action").textContent = plainManagementAction(analysis.managementConclusion.action);
  document.getElementById("strategy-recommended-procurement").textContent = plainProcurementRecommendation(analysis.managementConclusion.recommendedStrategy);
  document.getElementById("strategy-reasons").innerHTML = analysis.managementConclusion.reasons.map((item) => `<li>${escapeHtml(plainManagementText(item))}</li>`).join("");
  document.getElementById("strategy-conditions").innerHTML = analysis.managementConclusion.conditions.map((item) => `<li>${escapeHtml(plainManagementText(item))}</li>`).join("");
  renderStrategyFacts(analysis);
  renderStrategyScore("capital", analysis.scores.capitalAllocation);
  renderStrategyScore("portfolio", analysis.scores.currentPortfolio);
  document.getElementById("strategy-priorities").innerHTML = analysis.investmentPriorities.length
    ? analysis.investmentPriorities.map((project, index) => `
        <article>
          <span class="priority-rank">0${index + 1}</span>
          <h3>${escapeHtml(plainProjectName(project.name))}</h3>
          <strong>${escapeHtml(index === 0 ? "Highest current priority" : `Priority ${index + 1} of ${analysis.investmentPriorities.length}`)}</strong>
          <p>${escapeHtml(plainProjectRationale(project))}</p>
          <details class="project-evidence"><summary>View report evidence</summary>${renderCitations(project.citations)}</details>
        </article>`).join("")
    : '<p class="chart-empty">Project-level required capital, committed capital, abatement and delivery year are needed before priorities can be ranked.</p>';
  renderCreditSpecification(analysis.creditSpecification);
  renderStrategyScenarios(analysis.procurementScenarios);
  renderStrategyMethod(analysis);
}

function renderStrategyFacts(analysis) {
  const annualVolume = analysis.demand.years[0]?.volumeTco2e ?? 0;
  const recommended = analysis.procurementScenarios.find((scenario) => scenario.recommended) ?? analysis.procurementScenarios[0];
  document.getElementById("strategy-fact-volume").textContent = `${formatReadableTco2e(annualVolume).replace(" CO₂e", "")}/year`;
  document.getElementById("strategy-fact-year").textContent = analysis.questionnaire.useYear ?? analysis.demand.years[0]?.year ?? "Not confirmed";
  document.getElementById("strategy-fact-cash-cost").textContent = recommended ? formatUsdCompact(recommended.nominalCostUsd) : "Not available";
  document.getElementById("strategy-fact-gap").textContent = analysis.scores.capitalAllocation.score === null ? "Project costs" : "Credit details";
}

function renderStrategyScore(prefix, score) {
  const value = document.getElementById(`strategy-${prefix}-score`);
  const confidence = document.getElementById(`strategy-${prefix}-confidence`);
  const drivers = document.getElementById(`strategy-${prefix}-drivers`);
  if (score.score === null) {
    const noPortfolio = prefix === "portfolio" && /no portfolio/i.test(score.band);
    value.textContent = noPortfolio ? "No portfolio disclosed" : "Not enough data";
    confidence.textContent = noPortfolio
      ? "The report mentions carbon offsets but does not identify individual credits that can be quality-checked."
      : "This is not a low score. The report does not disclose project-level funding amounts.";
    drivers.innerHTML = "";
    return;
  }
  value.textContent = `${score.score} / 100 · ${plainScoreBand(score.band)}`;
  confidence.textContent = `${score.confidence} evidence coverage${score.highRisk ? " · important quality concern identified" : ""}`;
  drivers.innerHTML = Object.entries(score.dimensions ?? {}).map(([key, item]) => `
    <div class="score-driver"><span>${escapeHtml(plainScoreDimension(key))}</span><strong>${item.score === null ? "Not enough data" : item.score}</strong><div><i style="width:${item.score ?? 0}%"></i></div><small>${escapeHtml(item.explanation)}</small></div>
  `).join("");
}

function renderCreditSpecification(specification) {
  const groups = [
    {
      title: "Quality and tracking",
      items: [
        "Use credits approved under the Core Carbon Principles (CCP) where available, or complete an equivalent project-quality review.",
        "Record the tracking registry, calculation method, year created, serial number and independent verification for every credit.",
        "Confirm that no other company or country claims the same emissions reduction.",
      ],
    },
    {
      title: "Types and long-term mix",
      items: [
        "Use credible emission-reduction credits only as a near-term bridge.",
        "Include credits that remove carbon through nature and a small initial share of long-lasting carbon removal.",
        "Increase longer-lasting carbon removal as the 2050 target approaches.",
      ],
    },
    {
      title: "Delivery and contract protection",
      items: [
        `Plan for credits delivered in ${specification.deliveryWindow}.`,
        plainProcurementForm(specification.procurementForm),
        "Require clear ownership and replacement protection if credits are not delivered.",
      ],
    },
    {
      title: "Do not buy",
      items: [
        "Credits with unclear tracking or calculation methods.",
        "Credits with unclear ownership, no replacement protection or double-counting concerns.",
        "Credits used instead of reducing the company's own emissions.",
      ],
    },
  ];
  document.getElementById("strategy-specification").innerHTML = groups.map((group) => `
    <article>
      <h3>${escapeHtml(group.title)}</h3>
      <ul>${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>`).join("");
}

function renderStrategyScenarios(scenarios) {
  const recommended = scenarios.find((scenario) => scenario.recommended) ?? scenarios[0];
  const alternatives = scenarios.filter((scenario) => scenario !== recommended);
  document.getElementById("strategy-scenarios").innerHTML = `
    <p class="scenario-explainer"><strong>Total cash payments</strong> are the easiest budget view. <strong>Cost in today's dollars</strong> converts future payments using the selected comparison rate, so options paid at different times can be compared fairly.</p>
    ${renderPurchaseScenarioCard(recommended, { primary: true })}
    <div class="scenario-alternatives">${alternatives.map((scenario) => renderPurchaseScenarioCard(scenario)).join("")}</div>`;
  const max = Math.max(...scenarios.map((scenario) => scenario.npvCostUsd), 1);
  document.getElementById("strategy-cashflow-chart").innerHTML = `<svg viewBox="0 0 720 190" role="img" aria-labelledby="strategy-chart-title strategy-chart-desc">
    <title id="strategy-chart-title">Purchase option cost comparison in today's dollars</title>
    <desc id="strategy-chart-desc">Bars compare three purchase options using the same estimated annual need and the same comparison rate.</desc>
    ${scenarios.map((scenario, index) => {
      const width = 500 * scenario.npvCostUsd / max;
      const y = 30 + index * 52;
      return `<text x="0" y="${y + 16}" class="chart-label">${escapeHtml(plainScenarioLabel(scenario.label))}</text><rect x="165" y="${y}" width="500" height="22" class="chart-track"></rect><rect x="165" y="${y}" width="${width}" height="22" class="${scenario.recommended ? "chart-series-1" : "chart-series-2"}"></rect><text x="675" y="${y + 16}" class="chart-value">${escapeHtml(formatUsd(scenario.npvCostUsd))}</text>`;
    }).join("")}
  </svg>`;
}

function renderPurchaseScenarioCard(scenario, { primary = false } = {}) {
  const comparison = scenario.key === "wait_spot"
    ? ["Comparison with buying later", "Baseline option"]
    : scenario.potentialNpvSavingVsWaitUsd >= 0
      ? ["Estimated saving vs buying later", formatUsd(scenario.potentialNpvSavingVsWaitUsd)]
      : ["Estimated extra cost vs buying later", formatUsd(Math.abs(scenario.potentialNpvSavingVsWaitUsd))];
  return `
    <article class="purchase-option${primary ? " is-recommended" : ""}">
      <span>${primary ? "Recommended now" : "Alternative"}</span>
      <h3>${escapeHtml(plainScenarioLabel(scenario.label))}</h3>
      ${primary ? "<p>Keep flexibility until the annual need and quality requirements are confirmed.</p>" : ""}
      <dl>
        <div><dt>Total cash payments</dt><dd>${formatUsd(scenario.nominalCostUsd)}</dd></div>
        <div><dt>Cost in today's dollars</dt><dd>${formatUsd(scenario.npvCostUsd)}</dd></div>
        <div><dt>Average price per tonne</dt><dd>$${scenario.weightedAverageUsdPerTco2e.toFixed(1)}</dd></div>
        <div><dt>Contracted in advance</dt><dd>${formatCompactTco2e(scenario.securedVolumeTco2e)}</dd></div>
        <div><dt>Contracted volume that may not arrive</dt><dd>${formatCompactTco2e(scenario.deliveryAtRiskTco2e)}</dd></div>
        <div><dt>Possible extra cost if delivery fails</dt><dd>${formatUsd(scenario.replacementCostExposureUsd)}</dd></div>
        <div><dt>${escapeHtml(comparison[0])}</dt><dd>${escapeHtml(comparison[1])}</dd></div>
      </dl>
    </article>`;
}

function renderStrategyMethod(analysis) {
  const citations = [
    ...(analysis.evidenceProfile?.emissions?.citations ?? []),
    ...(analysis.evidenceProfile?.target?.citations ?? []),
    ...(analysis.evidenceProfile?.projects ?? []).flatMap((item) => item.citations ?? []),
    ...(analysis.evidenceProfile?.currentPortfolio?.citations ?? []),
  ].filter((citation, index, items) => items.findIndex((item) => item.quote === citation.quote && item.pages.join(",") === citation.pages.join(",")) === index);
  const demoDisclosure = activeCreditDemo ? `
    <div class="demo-disclosure">
      <p><strong>Report evidence</strong> — TSMC 2024 Sustainability Report (${activeCreditDemo.sourcePageCount} pages). Evidence was classified once and citations were human-reviewed.</p>
      <p><strong>Planning proxy and illustrative assumptions</strong></p>
      <ul>${activeCreditDemo.assumptions.map((assumption) => `<li>${escapeHtml(assumption)}</li>`).join("")}</ul>
    </div>` : "";
  document.getElementById("strategy-method-content").innerHTML = `
    ${demoDisclosure}
    <p>The internal-project review considers: confirmed funding (30%), emissions reduction supported by that funding (25%), delivery before the target year (20%), coverage of major emissions sources (15%), and evidence that results can be measured and independently checked (10%). A carbon-credit quality score is shown only when individual credits are disclosed.</p>
    <p>${escapeHtml(analysis.market.disclaimer)} Price assumptions version ${escapeHtml(analysis.market.version)}, dated ${escapeHtml(analysis.market.asOfDate)}.</p>
    ${citations.map((citation) => `<p class="evidence-citation"><strong>Evidence:</strong> “${escapeHtml(citation.quote)}” · PDF p. ${citation.pages.join(", ")}</p>`).join("")}
    <p>${analysis.sources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a>`).join(" · ")}</p>`;
}

function openAdvisoryDialog() {
  if (!activeCreditStrategyAnalysis) return;
  const analysis = activeCreditStrategyAnalysis;
  const volume = analysis.demand.years[0]?.volumeTco2e ?? 0;
  document.getElementById("advisory-summary").value = [
    `Company: ${analysis.company}`,
    `Management action: ${analysis.managementConclusion.action}`,
    `Recommended procurement: ${analysis.managementConclusion.recommendedStrategy}`,
    `Planning volume: ${formatTco2e(volume)} per year`,
    `Capital allocation: ${analysis.scores.capitalAllocation.score ?? "N/A"} (${analysis.scores.capitalAllocation.band})`,
    `Portfolio quality: ${analysis.scores.currentPortfolio.score ?? "N/A"} (${analysis.scores.currentPortfolio.band})`,
    `Open conditions: ${analysis.managementConclusion.conditions.join("; ") || "None recorded"}`,
  ].join("\n");
  document.getElementById("advisory-dialog").showModal();
}

function plainManagementAction(action) {
  return {
    "Prepare only": "Prepare first — do not buy yet",
    "Do not procure yet": "Do not buy yet",
    "Start sourcing": "Start talking to suppliers",
    "Buy/contract now": "Begin purchasing now",
  }[action] ?? action;
}

function plainProcurementRecommendation(strategy) {
  return {
    "Wait & Spot": "Recommended approach: do not sign a long-term contract yet; buy only if a confirmed need arises.",
    "Staged Procurement": "Recommended approach: buy in stages instead of committing the full amount now.",
    "Secure Early / Offtake": "Recommended approach: contract most of the expected supply early, with delivery protections.",
  }[strategy] ?? `Recommended purchase approach: ${strategy}`;
}

function plainManagementText(value) {
  const replacements = {
    "Future demand is plausible but not sufficiently confirmed.": "Carbon credits may be needed later, but the amount and timing are not yet certain enough to buy now.",
    "Prepare the specification and approvals before committing capital.": "Agree the quality requirements and internal approvals before committing money.",
    "Complete project capex and abatement ranges.": "Confirm the cost and expected emissions reduction for each internal project.",
    "Complete project-level CCP and contract due diligence before signing.": "Before signing, check each credit project against recognized quality standards and confirm the contract protections.",
    "Confirm the emissions and claim boundary.": "Confirm which emissions are included in the target and in any future public claim.",
    "Quantify the annual planning volume.": "Estimate how many credits may be needed each year.",
  };
  return replacements[value] ?? value
    .replace(/procure/gi, "buy")
    .replace(/capital allocation/gi, "internal-project funding")
    .replace(/demand/gi, "expected credit need");
}

function plainProjectRationale(project) {
  const reduction = `Potential emissions reduction: ${formatReadableTco2e(project.expectedAbatementTco2e)}.`;
  const capital = project.requiredCapitalUsd === null
    ? "Project cost: not disclosed."
    : `Remaining funding needed: ${formatUsd(project.fundingGapUsd ?? 0)}.`;
  const delivery = project.deliveryYear ? `Reported delivery year: ${project.deliveryYear}.` : "Delivery year: not disclosed.";
  return `${reduction} ${capital} ${delivery}`;
}

function plainProjectName(name) {
  return {
    "Renewable energy procurement": "Buy renewable electricity",
    "Operational emissions abatement": "Reduce emissions from factory operations",
    "Fab energy conservation program": "Improve factory energy efficiency",
    "Supplier carbon reduction program": "Help suppliers reduce emissions",
  }[name] ?? name;
}

function plainScoreBand(band) {
  return { Strong: "Strong evidence", Sound: "Adequate evidence", "Needs adjustment": "Needs improvement", Weak: "Weak evidence" }[band] ?? band;
}

function plainScoreDimension(key) {
  return {
    fundingCoverage: "How much required project funding is confirmed?",
    costEffectiveness: "How much emissions reduction does the funded amount support?",
    timingAlignment: "Will projects deliver before the target year?",
    sourceCoverage: "Do projects address the company's major emissions sources?",
    deliveryMrv: "Can delivery and emissions results be measured and checked?",
    integrity: "Is there credible evidence that the credits represent real reductions?",
    useCaseFit: "Do the credits fit the intended use?",
    deliveryRisk: "How likely are the credits to arrive on time?",
    concentration: "Is the portfolio overly dependent on one project or method?",
    contractOwnership: "Are ownership and replacement protections clear?",
    retirementClaims: "Are cancellation and public-claim controls clear?",
  }[key] ?? titleCase(key);
}

function plainProcurementForm(value) {
  if (/No purchase commitment/i.test(value)) return "Do not commit to a purchase yet. First agree an approved list of quality and contract requirements.";
  if (/Staged forward/i.test(value)) return "Buy in stages, require protection if credits are not delivered, and keep some volume to buy later if needed.";
  if (/offtake/i.test(value)) return "Contract most supply early, keep a smaller portion to buy later, and require protection if delivery fails.";
  return value;
}

function plainScenarioLabel(label) {
  return {
    "Wait & Spot": "Buy later if needed",
    "Staged Procurement": "Buy in stages",
    "Secure Early / Offtake": "Contract most supply early",
  }[label] ?? label;
}

function formatReadableTco2e(value) {
  const amount = Number(value ?? 0);
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 ? 2 : 0)} million tonnes CO₂e`;
  return `${Math.round(amount).toLocaleString()} tonnes CO₂e`;
}

function formatUsdCompact(value) {
  const amount = Number(value ?? 0);
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return formatUsd(amount);
}

function titleCase(value) {
  return String(value).replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}

function init() {
  renderFrameworkAdmin();
  view.uploadButton.disabled = false;

  Object.values(fields).forEach((field) => {
    field.addEventListener("input", updateCalculations);
  });

  document.getElementById("print-button").addEventListener("click", () => {
    window.print();
  });

  document.getElementById("demo-button").addEventListener("click", () => {
    showReport(aiibFixture, "AIIB demo loaded.");
  });

  document.getElementById("nvidia-demo-button").addEventListener("click", () => {
    showReport(nvidiaFixture, "NVIDIA FY25 demo loaded.");
  });

  document.getElementById("tsmc-demo-button").addEventListener("click", () => {
    showReport(tsmcFixture, "TSMC 2024 demo loaded.");
  });

  document.getElementById("tsmc-investment-demo-button").addEventListener("click", () => {
    history.pushState("", document.title, sustainabilityInvestmentDemoHash);
    showCreditStrategyView({ precomputedDemo: true, returnView: "start" });
  });

  document.getElementById("open-credit-strategy-button").addEventListener("click", () => {
    history.pushState("", document.title, creditStrategyHash);
    showCreditStrategyView({ returnView: "report" });
  });
  document.getElementById("open-credit-strategy-demo-button").addEventListener("click", () => {
    history.pushState("", document.title, sustainabilityInvestmentDemoHash);
    showCreditStrategyView({ precomputedDemo: true, returnView: "report" });
  });
  document.getElementById("generate-credit-strategy-button").addEventListener("click", generateCreditStrategyAnalysis);
  ["strategy-boundary", "strategy-public-claim", "strategy-use-year", "strategy-demand-volume", "strategy-demand-confidence", "strategy-budget", "strategy-risk", "strategy-upfront", "strategy-cost-capital"].forEach((id) => {
    document.getElementById(id).addEventListener("change", rerenderCreditStrategyLocally);
  });
  document.getElementById("strategy-back-button").addEventListener("click", () => {
    history.pushState("", document.title, window.location.pathname + window.location.search);
    view.strategy.classList.add("is-hidden");
    if (creditStrategyReturnView === "report") {
      view.report.classList.remove("is-hidden");
    } else {
      showStartView();
    }
  });
  document.getElementById("book-advisory-button").addEventListener("click", openAdvisoryDialog);

  view.retryButton.addEventListener("click", retryPendingAnalysis);
  view.cancelButton.addEventListener("click", cancelActiveAnalysis);
  document.getElementById("admin-back-button").addEventListener("click", () => {
    showStartView({ clearHash: true });
  });
  window.addEventListener("hashchange", routeFromHash);

  document.addEventListener("click", (event) => {
    const analyzeButton = event.target.closest("#upload-preview-button");
    if (!analyzeButton) return;
    event.preventDefault();
    handleUploadedPreview();
  });

  document.getElementById("report-upload").addEventListener("change", handleUploadSelection);
  document.getElementById("report-upload").addEventListener("input", handleUploadSelection);
  if (!routeFromHash()) {
    void restoreActiveJob();
  }
}

init();
