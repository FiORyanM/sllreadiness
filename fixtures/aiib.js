export const aiibFixture = {
  modeLabel: "AIIB demo",
  company: {
    label: "AIIB Asian Infrastructure Investment Bank",
    subtitle: "Multilateral Development Bank - Beijing - 2024 Sustainability Report",
    generatedDate: "Generated May 2026",
    footer:
      "Based on 2024 AIIB Sustainability Report - SLLP March 2025 - Execution cost figures are indicative estimates - Adjust parameters above to update all figures",
  },
  verdict: {
    title: "SLL-viable - strong candidate for immediate outreach",
    copy: "Mature ESG infrastructure. Low execution cost. Multiple ready-to-use KPIs identified.",
  },
  dealDefaults: {
    loanSizeM: 500,
    tenor: 5,
    baseMargin: 150,
    ratchetBest: 12,
    ratchetWorst: 5,
  },
  modelInputs: {
    recommendedKpiCount: 2,
    hasLowConfidence: true,
    bestCaseSetupFloors: {
      dataInfrastructure: 20000,
    },
    worstCaseExcludedDrivers: ["dataInfrastructure"],
    componentsByKey: {
      kpiDataHistory: { name: "KPI data history", score: 95, maturity: "high", status: "High" },
      kpiMethodology: { name: "KPI methodology", score: 90, maturity: "high", status: "High" },
      reportingInfrastructure: { name: "Reporting infrastructure", score: 92, maturity: "high", status: "High" },
      externalVerification: { name: "External verification", score: 88, maturity: "high", status: "High" },
      strategicAlignment: { name: "Financed emissions", score: 55, maturity: "medium", status: "Partial" },
    },
  },
  analysis: {
    kpis: [
      {
        name: "Climate finance share",
        evidence: "67% in 2024 - tracked since 2021 - public target set",
        status: "Ready",
      },
      {
        name: "Institutional GHG intensity",
        evidence: "ISO 14064 - 3yr history - third-party verified",
        status: "Ready",
      },
      {
        name: "Paris-aligned projects share",
        evidence: "98% of new projects 2024 - BB1+BB2 documented",
        status: "Ready",
      },
      {
        name: "Financed emissions intensity",
        evidence: "27% coverage - PCAF score 2.5 - expanding",
        status: "Partial",
      },
    ],
    gaps: [
      {
        title: "Financed emissions portfolio coverage",
        description: "27% covered - avoid as SPT KPI until expanded",
        severity: "Medium",
      },
      {
        title: "Counterparty Scope 3 emissions",
        description: "Excluded - acknowledged in report, remediation in progress",
        severity: "Medium",
      },
      {
        title: "No gaps in core SLL compliance infrastructure",
        description: "Data, reporting, governance and verification all in place",
        severity: "Low",
      },
    ],
    baseMarginNote:
      "150bps is a generic corporate placeholder. AIIB's actual sovereign lending spreads are lower (AAA-rated MDB). Adjust the base margin parameter to reflect the actual deal terms for accurate figures.",
  },
};
