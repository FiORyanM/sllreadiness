import { aiibFixture } from "./fixtures/aiib.js";
import { nvidiaFixture } from "./fixtures/nvidia.js";
import { tsmcFixture } from "./fixtures/tsmc.js";
import { extractPdfText } from "./extraction/pdfExtractionAdapter.js";
import { extractSllReadinessJson, validateSllExtractionJson } from "./extraction/sllExtractionAdapter.js";
import { mapExtractionToReport } from "./mappers/reportMapper.js";
import { calculateExecutionCost } from "./models/costModel.js";
import { calculateScenario, clamp, dollars, loanMillions, signedDollars } from "./models/financialModel.js";
import { readinessBandLabel, weightedReadinessFromScores } from "./models/scoringModel.js";

let activeReport = enrichReport(aiibFixture);
let selectedUpload = null;
let isExtracting = false;

const view = {
  start: document.getElementById("start-view"),
  report: document.getElementById("report-view"),
  status: document.getElementById("start-status"),
  selectedFile: document.getElementById("selected-file"),
  uploadButton: document.getElementById("upload-preview-button"),
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
];

const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

function enrichReport(report) {
  const scoring = weightedReadinessFromScores(report.modelInputs.componentsByKey);
  const executionCost = calculateExecutionCost({
    readinessBand: scoring.band,
    kpiCount: report.modelInputs.recommendedKpiCount,
    tenor: report.dealDefaults.tenor,
    hasLowConfidence: report.modelInputs.hasLowConfidence,
    options: {
      bestCaseSetupFloors: report.modelInputs.bestCaseSetupFloors,
      worstCaseExcludedDrivers: report.modelInputs.worstCaseExcludedDrivers,
    },
  });

  return {
    ...report,
    analysis: {
      ...report.analysis,
      readinessScore: scoring.score100,
      readinessBand: readinessBandLabel(scoring.band),
      executionCost,
      components: Object.values(report.modelInputs.componentsByKey),
      scoring,
    },
  };
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
  els["overall-readiness"].textContent = `${report.analysis.readinessScore} / 100`;
  els["readiness-band"].textContent = report.analysis.readinessBand;
  els["base-margin-note"].textContent = report.analysis.baseMarginNote;
  els["report-footer"].textContent = report.company.footer;
}

function renderComponents(report) {
  const container = document.getElementById("component-list");
  container.innerHTML = report.analysis.components
    .map(
      (component) => `
        <div class="component-row">
          <div class="component-name">${component.name}</div>
          <div class="component-score">${component.score}%</div>
          <div class="component-status">${component.status}</div>
          <div class="bar" aria-label="${component.name} score ${component.score}%">
            <span style="width: ${component.score}%"></span>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderKpis(report) {
  const container = document.getElementById("kpi-list");
  container.innerHTML = report.analysis.kpis
    .map((kpi) => {
      const statusClass = kpi.status.toLowerCase() === "ready" ? "status-ready" : "status-partial";
      return `
        <div class="kpi-item">
          <div>
            <h3>${kpi.name}</h3>
            <p>${kpi.evidence}</p>
          </div>
          <span class="status-badge ${statusClass}">${kpi.status}</span>
        </div>
      `;
    })
    .join("");
}

function renderGaps(report) {
  const container = document.getElementById("gap-list");
  container.innerHTML = report.analysis.gaps
    .map((gap) => {
      const severityClass = gap.severity.toLowerCase() === "low" ? "severity-low" : "severity-medium";
      return `
        <div class="gap-item">
          <div>
            <h3>${gap.title}</h3>
            <p>${gap.description}</p>
          </div>
          <span class="severity-badge ${severityClass}">${gap.severity}</span>
        </div>
      `;
    })
    .join("");
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
    setUploadStatus("Extraction failed. Please try a text-based PDF or use the AIIB demo.", "error");
  } finally {
    isExtracting = false;
    previewButton.disabled = false;
    previewButton.textContent = "Analyze Uploaded PDF";
  }
}

async function extractUploadedReport(pdfResult) {
  try {
    const aiResponse = await fetch("/api/extraction-jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: pdfResult.text,
        metadata: pdfResult.metadata,
      }),
    });

    if (!aiResponse.ok) {
      const detail = await safeReadJson(aiResponse);
      throw new Error(detail.message || `AI extraction failed with ${aiResponse.status}`);
    }

    const payload = await aiResponse.json();

    if (!payload.ok || !payload.job) throw new Error(payload.message || "AI extraction job could not be created.");

    const completedJob = await pollExtractionJob(payload.job);
    if (!completedJob.result?.extraction) throw new Error(completedJob.error || "AI extraction did not return structured JSON.");

    return {
      extraction: completedJob.result.extraction,
      statusMessage: completedJob.cacheHit
        ? "AI extraction loaded from cache."
        : completedJob.fallbackChunks
          ? `AI extraction completed with rules fallback for ${completedJob.fallbackChunks} section(s).`
          : "AI extraction completed.",
    };
  } catch (error) {
    console.warn("AI extraction unavailable; falling back to rules.", error);
    setUploadStatus("AI extraction unavailable. Falling back to browser rules...");

    return {
      extraction: extractSllReadinessJson(pdfResult),
      statusMessage: "Rules fallback completed.",
    };
  }
}

async function pollExtractionJob(initialJob) {
  let job = initialJob;

  while (job.status === "queued" || job.status === "processing") {
    setUploadStatus(`${job.stage} (${job.progress.completed} / ${job.progress.total})`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const response = await fetch(`/api/extraction-jobs/${encodeURIComponent(job.id)}`);
    const payload = await safeReadJson(response);
    if (!response.ok || !payload.ok || !payload.job) throw new Error(payload.message || "Unable to read extraction progress.");
    job = payload.job;
  }

  if (job.status !== "completed") throw new Error(job.error || "AI extraction job failed.");
  return job;
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

  document.addEventListener("click", (event) => {
    const analyzeButton = event.target.closest("#upload-preview-button");
    if (!analyzeButton) return;
    event.preventDefault();
    handleUploadedPreview();
  });

  document.getElementById("report-upload").addEventListener("change", handleUploadSelection);
  document.getElementById("report-upload").addEventListener("input", handleUploadSelection);
}

init();
