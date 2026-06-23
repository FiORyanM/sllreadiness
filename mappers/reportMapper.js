import { normalizeAiExtraction } from "../extraction/aiExtractionNormalizer.js";
import { weightedReadinessFromScores } from "../models/scoringModel.js";

export function mapExtractionToReport(extraction) {
  extraction = normalizeAiExtraction(extraction);
  const companyName = extraction.company.name || "Uploaded company";
  const reportingYear = extraction.company.reportingYear || "latest";
  const fileName = extraction.source.fileName;

  return {
    modeLabel: "Uploaded report",
    company: {
      label: companyName,
      subtitle: `${extraction.company.reportTitle} - ${fileName}`,
      generatedDate: "Generated from uploaded PDF",
      footer:
        reportScopeFooter(extraction.source.analysisScope),
    },
    verdict: verdictFromExtraction(extraction),
    dealDefaults: extraction.dealDefaults,
    modelInputs: extraction.modelInputs,
    analysis: {
      kpis: extraction.analysis.kpis.map((kpi) => ({
        name: kpi.name,
        evidence: confidenceSuffix(kpi.evidence, kpi.confidence),
        status: kpi.status,
        citations: kpi.citations,
      })),
      gaps: extraction.analysis.gaps,
      baseMarginNote: extraction.analysis.baseMarginNote,
      extractionSummary: {
        reportingYear,
        confidence: extraction.confidence.overall,
      },
    },
  };
}

function reportScopeFooter(scope) {
  const caveat = "SLLP March 2025 - Execution cost figures are indicative estimates - not decision-grade";
  if (scope?.fullCoverage) return `Evidence extraction processed all ${scope.analyzedPageCount} unique PDF pages${scope.duplicatePageCount ? ` (${scope.duplicatePageCount} exact duplicates removed)` : ""} - ${caveat}`;
  return `Based on browser-side PDF text extraction - ${caveat}`;
}

function verdictFromExtraction(extraction) {
  if (extraction.modelInputs.assessmentState !== "assessed") {
    return {
      title: "Potential SLL candidate — insufficient cited evidence",
      copy: "This report has not been scored because one or more SLL readiness components lack a quoted, page-level source. It requires evidence review before any SLL conclusion.",
    };
  }

  const readyKpis = extraction.analysis.kpis.filter((kpi) => kpi.status === "Ready").length;
  const materialGaps = extraction.analysis.gaps.filter((gap) => gap.severity === "Medium" || gap.severity === "High").length;
  const hasVerificationGate = extraction.modelInputs.componentsByKey.externalVerification?.score >= 75;
  const readiness = weightedReadinessFromScores(extraction.modelInputs.componentsByKey).score100;

  if (readiness >= 75 && readyKpis >= 2 && materialGaps <= 1 && hasVerificationGate) {
    return {
      title: "Potential SLL candidate — evidence review required",
      copy: "The uploaded report has cited KPI, reporting and verification signals that warrant a first-pass SLL discussion; this is not a lender decision.",
    };
  }

  if (readiness >= 40 && readyKpis >= 1) {
    return {
      title: "Potential SLL candidate — gaps to close",
      copy: hasVerificationGate
        ? "The uploaded report contains usable ESG signals, but lender-ready KPI/SPT evidence needs review."
        : "The uploaded report contains usable ESG signals, but SLLP external verification evidence needs confirmation before it can be treated as lender-ready.",
    };
  }

  return {
    title: "Not yet a potential SLL candidate — build cited evidence",
    copy: "The uploaded report needs stronger KPI history, methodology or verification before outreach.",
  };
}

function confidenceSuffix(evidence, confidence) {
  if (!confidence) return evidence;
  return `${evidence} (${confidence} confidence)`;
}
