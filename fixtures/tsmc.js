export const tsmcFixture = {
  modeLabel: "TSMC demo",
  company: {
    label: "TSMC",
    subtitle: "Semiconductors - 2024 Sustainability Report",
    generatedDate: "Generated from 2024 TSMC Sustainability Report",
    footer:
      "Based on 2024 TSMC Sustainability Report - SLLP March 2025 - Full PDF text extracted and calibrated against the readiness framework - Execution cost figures are indicative estimates",
  },
  verdict: {
    title: "Potentially SLL-viable - strong infrastructure, execution gaps to calibrate",
    copy:
      "TSMC has mature ESG reporting, verified GHG data and clear climate targets. The SLL workstream should focus on ambitious annual SPT calibration and transition-execution gaps.",
  },
  dealDefaults: {
    loanSizeM: 500,
    tenor: 5,
    baseMargin: 150,
    ratchetBest: 10,
    ratchetWorst: 5,
  },
  modelInputs: {
    recommendedKpiCount: 2,
    hasLowConfidence: false,
    bestCaseSetupFloors: {},
    worstCaseExcludedDrivers: [],
    componentsByKey: {
      kpiDataHistory: { name: "KPI data history", score: 94, maturity: "high", status: "High" },
      kpiMethodology: { name: "KPI methodology", score: 92, maturity: "high", status: "High" },
      reportingInfrastructure: { name: "Reporting infrastructure", score: 90, maturity: "high", status: "High" },
      externalVerification: { name: "External verification", score: 94, maturity: "high", status: "High" },
      strategicAlignment: { name: "Strategic alignment", score: 78, maturity: "high", status: "High" },
    },
  },
  analysis: {
    kpis: [
      {
        name: "Renewable energy use",
        evidence: "Renewable energy used at all fab operation sites rose from 10.4% to 11.2% to 14.1% across 2022-2024; overseas subsidiaries used 100%.",
        status: "Ready",
      },
      {
        name: "Scope 1 and 2 GHG emissions intensity",
        evidence:
          "Scope 1 and 2 data are disclosed with 2020-2024 history and reasonable assurance; 2024 unit GHG emissions were 19% above the 2020 base year.",
        status: "Partial",
      },
      {
        name: "Supplier carbon management coverage",
        evidence:
          "High-energy-consumption suppliers with ISO 14064 verification reached 90% in 2024; supplier CDP response rate reached 100%.",
        status: "Ready",
      },
      {
        name: "Cumulative energy-saving rate",
        evidence: "Cumulative energy-saving rate from 2016 to 2030 reached 15% in 2024 against an 18% 2030 goal.",
        status: "Ready",
      },
    ],
    gaps: [
      {
        title: "Unit GHG emissions target needs careful SPT calibration",
        description:
          "TSMC missed its 2024 unit GHG reduction target, so an SLL SPT should be calibrated with credible annual pathways and transition levers.",
        severity: "Medium",
      },
      {
        title: "Renewable energy trajectory requires acceleration",
        description:
          "2024 renewable energy use reached 14.1% of total power consumption against a 2030 goal of 60%, making annual SPT pacing important.",
        severity: "Medium",
      },
      {
        title: "Scope 3 and supplier decarbonization remain material",
        description:
          "Scope 3 emissions and supplier performance are material to semiconductor value-chain transition and should be reviewed before use as loan KPIs.",
        severity: "Medium",
      },
    ],
    baseMarginNote:
      "150bps is a generic corporate placeholder. Replace with TSMC-specific financing assumptions for decision-useful economics.",
  },
};
