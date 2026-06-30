import { aiibFixture } from "./fixtures/aiib.js";
import { nvidiaFixture } from "./fixtures/nvidia.js";
import { tsmcFixture } from "./fixtures/tsmc.js";
import { extractPdfText } from "./extraction/pdfExtractionAdapter.js";
import { validateSllExtractionJson } from "./extraction/sllExtractionAdapter.js";
import { mapExtractionToReport } from "./mappers/reportMapper.js";
import { calculateExecutionCost } from "./models/costModel.js";
import { calculateScenario, clamp, dollars, loanMillions, signedDollars } from "./models/financialModel.js";
import { readinessBandLabel, weightedReadinessFromScores } from "./models/scoringModel.js";
import { normalizeSustainabilityInvestmentAnalysis } from "./models/sustainabilityInvestmentModel.js";

let activeReport = enrichReport(aiibFixture);
let selectedUpload = null;
let isExtracting = false;
let pendingExtractionJob = null;
let activeExtractionJob = null;

const view = {
  start: document.getElementById("start-view"),
  report: document.getElementById("report-view"),
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
  "investment-rating",
  "investment-score",
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
  const analysis = report.analysis.sustainabilityInvestments;
  const container = document.getElementById("investment-list");
  els["investment-rating"].textContent = analysis.overallRating;
  els["investment-score"].textContent = analysis.carbonCreditOpportunityScore ? `${analysis.carbonCreditOpportunityScore} / 100` : "Not assessed";
  els["investment-thesis"].textContent = analysis.carbonCreditThesis;

  if (!analysis.items.length) {
    container.innerHTML = '<p class="abstention-copy">No cited sustainability investment, capex, project or carbon credit activity was detected. Ask for project-level evidence before carbon credit transaction analysis.</p>';
    return;
  }

  container.innerHTML = analysis.items
    .map((item) => `
      <div class="investment-item">
        <div>
          <div class="investment-title-row">
            <h3>${escapeHtml(item.name)}</h3>
            <span class="investment-rating-badge">${escapeHtml(item.rating)}</span>
          </div>
          <p>${escapeHtml(item.assessment)}</p>
          <dl class="investment-details">
            <div><dt>Invested in</dt><dd>${escapeHtml(item.targetArea)}</dd></div>
            <div><dt>Amount</dt><dd>${escapeHtml(item.amount)}</dd></div>
            <div><dt>Carbon credit path</dt><dd>${escapeHtml(item.carbonCreditRelevance)} - ${escapeHtml(item.carbonCreditPathway)}</dd></div>
          </dl>
          ${renderCitations(item.citations)}
        </div>
        <strong class="investment-score">${item.score}</strong>
      </div>
    `)
    .join("");
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

function showReport(report, statusMessage) {
  activeReport = enrichReport(report);
  setDealDefaults(activeReport);
  renderReportMeta(activeReport);
  renderComponents(activeReport);
  renderKpis(activeReport);
  renderGaps(activeReport);
  renderSustainabilityInvestments(activeReport);
  updateCalculations();

  view.start.classList.add("is-hidden");
  view.report.classList.remove("is-hidden");
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

  clearJobToken(completedJob.id);
  return {
    extraction: completedJob.result.extraction,
    statusMessage: completedJob.cacheHit ? "AI extraction loaded from cache." : "AI extraction completed.",
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
    clearJobToken(completedJob.id);
    pendingExtractionJob = null;
    hideRetry();
    showReport(mapExtractionToReport(completedJob.result.extraction), "AI extraction completed after retry.");
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
      clearJobToken(job.id);
      showReport(mapExtractionToReport(job.result.extraction), "Recovered completed AI extraction.");
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

function init() {
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

  view.retryButton.addEventListener("click", retryPendingAnalysis);
  view.cancelButton.addEventListener("click", cancelActiveAnalysis);

  document.addEventListener("click", (event) => {
    const analyzeButton = event.target.closest("#upload-preview-button");
    if (!analyzeButton) return;
    event.preventDefault();
    handleUploadedPreview();
  });

  document.getElementById("report-upload").addEventListener("change", handleUploadSelection);
  document.getElementById("report-upload").addEventListener("input", handleUploadSelection);
  void restoreActiveJob();
}

init();
