export function mapExtractionToReport(extraction) {
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
        "Based on browser-side PDF text extraction - SLLP March 2025 - Execution cost figures are indicative estimates - Replace with Anthropic extraction before client use",
    },
    verdict: verdictFromExtraction(extraction),
    dealDefaults: extraction.dealDefaults,
    modelInputs: extraction.modelInputs,
    analysis: {
      kpis: extraction.analysis.kpis.map((kpi) => ({
        name: kpi.name,
        evidence: confidenceSuffix(kpi.evidence, kpi.confidence),
        status: kpi.status,
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

function verdictFromExtraction(extraction) {
  const readyKpis = extraction.analysis.kpis.filter((kpi) => kpi.status === "Ready").length;
  const materialGaps = extraction.analysis.gaps.filter((gap) => gap.severity === "Medium" || gap.severity === "High").length;
  const hasVerificationGate = extraction.modelInputs.componentsByKey.externalVerification?.score >= 75;

  if (readyKpis >= 2 && materialGaps <= 1 && hasVerificationGate) {
    return {
      title: "SLL-viable - proceed to evidence review",
      copy: "The uploaded report shows enough KPI, reporting and verification signals for a first-pass SLL discussion.",
    };
  }

  if (readyKpis >= 1 || materialGaps <= 3) {
    return {
      title: "Potentially SLL-viable - gaps to close",
      copy: hasVerificationGate
        ? "The uploaded report contains usable ESG signals, but lender-ready KPI/SPT evidence needs review."
        : "The uploaded report contains usable ESG signals, but SLLP external verification evidence needs confirmation before it can be treated as lender-ready.",
    };
  }

  return {
    title: "Not yet SLL-ready - build KPI evidence first",
    copy: "The uploaded report needs stronger KPI history, methodology or verification before outreach.",
  };
}

function confidenceSuffix(evidence, confidence) {
  if (!confidence) return evidence;
  return `${evidence} (${confidence} confidence)`;
}
