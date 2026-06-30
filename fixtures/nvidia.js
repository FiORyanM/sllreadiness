const cite = (quote, pages) => ({ quote, pages });

const nvidiaCitations = {
  renewableElectricity: cite("Renewable electricity percentage (%) 100% 76% 44%", [30]),
  renewableTarget: cite("We achieved and will maintain 100% renewable electricity for offices and data centers under our operational control.", [11]),
  ghgIntensity: cite("GHG emissions intensity (Scope 1 and 2 mtCO e/$M revenue) 0.1 0.9 2.6", [30]),
  scienceBasedTarget: cite("validated by the Science Based Targets", [12]),
  scope1Target: cite("To reduce absolute scope 1 and 2", [12]),
  scope3Target: cite("To reduce scope 3 emissions intensity", [12]),
  assurance: cite("External assurance Report of Independent Accountants for select metrics for FY25, FY24, and FY23.", [29]),
  annualSpts: cite("We plan to publish our FY26 progress", [12]),
  energyInvestment: cite("We achieved our goal of 100% renewable electricity", [39]),
};

export const nvidiaFixture = {
  modeLabel: "NVIDIA demo",
  company: {
    label: "NVIDIA Corporation",
    subtitle: "Technology / Semiconductors - FY25 Sustainability Report",
    generatedDate: "Generated from NVIDIA FY25 Sustainability Report",
    footer:
      "Based on NVIDIA Sustainability Report Fiscal Year 2025 - SLLP March 2025 - Full PDF text extracted and calibrated against the readiness framework - Execution cost figures are indicative estimates",
  },
  verdict: {
    title: "Potentially SLL-viable - strong data, SPT calibration needed",
    copy:
      "NVIDIA shows strong climate data, targets and assurance infrastructure. For an SLL, the remaining work is lender calibration of annual SPTs and loan-characteristic linkage.",
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
      kpiDataHistory: { name: "KPI data history", score: 92, maturity: "high", status: "High", citations: [nvidiaCitations.ghgIntensity] },
      kpiMethodology: { name: "KPI methodology", score: 90, maturity: "high", status: "High", citations: [nvidiaCitations.scienceBasedTarget] },
      reportingInfrastructure: { name: "Reporting infrastructure", score: 88, maturity: "high", status: "High", citations: [nvidiaCitations.renewableElectricity] },
      externalVerification: { name: "External verification", score: 88, maturity: "high", status: "High", citations: [nvidiaCitations.assurance] },
      strategicAlignment: { name: "Strategic alignment", score: 84, maturity: "high", status: "High", citations: [nvidiaCitations.scope3Target] },
    },
  },
  analysis: {
    kpis: [
      {
        name: "Renewable electricity percentage",
        evidence: "Renewable electricity percentage increased from 44% in FY23 to 76% in FY24 and 100% in FY25.",
        status: "Ready",
        citations: [nvidiaCitations.renewableElectricity],
      },
      {
        name: "GHG emissions intensity",
        evidence: "Scope 1 and 2 GHG emissions intensity improved from 2.6 to 0.9 to 0.1 mtCO2e/$M revenue across FY23-FY25.",
        status: "Ready",
        citations: [nvidiaCitations.ghgIntensity],
      },
      {
        name: "Science-based Scope 1 and 2 reduction",
        evidence: "SBTi validated targets include reducing absolute Scope 1 and 2 emissions 50% by FY30.",
        status: "Ready",
        citations: [nvidiaCitations.scope1Target],
      },
      {
        name: "Scope 3 product-use emissions intensity",
        evidence: "SBTi validated targets include reducing Scope 3 emissions intensity from use of sold GPU products by 75% per PFLOP by FY30.",
        status: "Partial",
        citations: [nvidiaCitations.scope3Target],
      },
    ],
    gaps: [
      {
        title: "Annual SPT schedule requires lender calibration",
        description:
          "The report discloses targets and multi-year KPI history, but an SLL would still need annual SPTs for each year of the loan term and observation dates.",
        severity: "Medium",
        citations: [nvidiaCitations.annualSpts],
      },
      {
        title: "Scope 3 KPI needs boundary and ambition review",
        description:
          "Scope 3 increased materially in FY25 while NVIDIA also has a product-use intensity target. Use only after methodology, denominator and ambition are lender-tested.",
        severity: "Medium",
        citations: [nvidiaCitations.scope3Target],
      },
      {
        title: "Loan characteristics not defined in ESG report",
        description:
          "Margin ratchet, trigger events and any neutral bracket would need to be documented in the SLL facility rather than inferred from sustainability reporting.",
        severity: "Medium",
        citations: [nvidiaCitations.annualSpts],
      },
    ],
    sustainabilityInvestments: {
      summary: "Renewable electricity procurement is the clearest cited operational decarbonization investment signal.",
      carbonCreditThesis:
        "Treat renewable electricity procurement as an internal reduction lever; carbon credits should be reserved for residual hard-to-abate emissions.",
      items: [
        {
          name: "Renewable electricity procurement",
          category: "renewable_energy",
          investmentType: "procurement",
          amount: "Not disclosed",
          targetArea: "Renewable electricity for operations",
          expectedImpact: "Reduce Scope 2 market-based emissions and support progress toward science-based targets.",
          score: 74,
          carbonCreditRelevance: "Medium",
          carbonCreditPathway:
            "Internal reduction lever; compare residual emissions after renewable electricity procurement before considering external credits.",
          assessment: "Strong operational decarbonization signal, with carbon credit relevance mainly for residual emissions planning.",
          citations: [nvidiaCitations.energyInvestment],
        },
      ],
    },
    baseMarginNote:
      "150bps is a generic corporate placeholder. Replace with NVIDIA-specific financing assumptions for decision-useful economics.",
  },
};
