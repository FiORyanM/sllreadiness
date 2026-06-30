const cite = (quote, pages) => ({ quote, pages });

const aiibCitations = {
  climateFinance: cite("Climate finance accounted for 67% of total AIIB financing approvals in 2024, up from 60% in 2023.", [27]),
  ghgProtocol: cite("The Bank has published institutional GHG emissions reports since 2022, starting with 2021 emissions, in accordance with the ISO 14064-1:2018 standard, which is generally consistent and compatible with the GHG Protocol.", [31]),
  greenInfrastructure: cite("In 2024, 50 out of 51 (98%) of AIIB's newly approved projects were aligned with the Green Infrastructure thematic priority.", [27]),
  financedEmissions: cite("27% of the total outstanding portfolio value of USD13.50 billion.", [47]),
  scope3Limit: cite("At this stage, counterparties' Scope 3 emissions are not included in AIIB's financed emissions due to limited data availability and methodological considerations.", [47]),
  pcafQuality: cite("The overall PCAF data quality score for AIIB's 2024 financed emissions is 2.5, indicating moderate reliance on proxy data in certain asset classes.", [47]),
  reportingGovernance: cite("AIIB creates a Bank-wide Sustainability Report Steering Committee to facilitate disclosure efforts towards the first Sustainability Report.", [16]),
  strategy: cite("As of July 1, 2023, all new investment operations have been aligned with the goals of the Paris Agreement.", [9]),
  sustainableEnergy: cite("The Türkiye: TSKB Sustainable Energy and Infrastructure On-lending Facility project finances eligible climate mitigation, climate adaptation and climate industry projects in Türkiye's energy, infrastructure and other productive sectors.", [12]),
};

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
      kpiDataHistory: { name: "KPI data history", score: 95, maturity: "high", status: "High", citations: [aiibCitations.climateFinance] },
      kpiMethodology: { name: "KPI methodology", score: 90, maturity: "high", status: "High", citations: [aiibCitations.ghgProtocol] },
      reportingInfrastructure: { name: "Reporting infrastructure", score: 92, maturity: "high", status: "High", citations: [aiibCitations.reportingGovernance] },
      externalVerification: { name: "External verification", score: 88, maturity: "high", status: "High", citations: [aiibCitations.ghgProtocol] },
      strategicAlignment: { name: "Financed emissions", score: 55, maturity: "medium", status: "Partial", citations: [aiibCitations.financedEmissions] },
    },
  },
  analysis: {
    kpis: [
      {
        name: "Climate finance share",
        evidence: "Climate finance accounted for 67% of total AIIB financing approvals in 2024, up from 60% in 2023.",
        status: "Ready",
        citations: [aiibCitations.climateFinance],
      },
      {
        name: "Institutional GHG reporting methodology",
        evidence: "AIIB has published institutional GHG emissions reports since 2022 under ISO 14064-1:2018, consistent with the GHG Protocol.",
        status: "Ready",
        citations: [aiibCitations.ghgProtocol],
      },
      {
        name: "Green Infrastructure project alignment",
        evidence: "50 out of 51 newly approved projects in 2024 were aligned with the Green Infrastructure thematic priority.",
        status: "Ready",
        citations: [aiibCitations.greenInfrastructure],
      },
      {
        name: "Financed emissions intensity",
        evidence: "AIIB calculated 724,063 tCO2e of financed emissions from 27% of the outstanding portfolio value; PCAF data quality score was 2.5.",
        status: "Partial",
        citations: [aiibCitations.financedEmissions],
      },
    ],
    gaps: [
      {
        title: "Financed emissions portfolio coverage",
        description: "Financed emissions were calculated for 27% of the outstanding portfolio value, so this should not be used as an SPT KPI until coverage expands.",
        severity: "Medium",
        citations: [aiibCitations.financedEmissions],
      },
      {
        title: "Counterparty Scope 3 emissions",
        description: "Counterparties' Scope 3 emissions are excluded because of limited data availability and methodological considerations.",
        severity: "Medium",
        citations: [aiibCitations.scope3Limit],
      },
      {
        title: "Financed emissions data quality remains moderate",
        description: "The PCAF score of 2.5 indicates moderate reliance on proxy data in some asset classes.",
        severity: "Low",
        citations: [aiibCitations.pcafQuality],
      },
    ],
    sustainabilityInvestments: {
      summary: "Climate finance and Green Infrastructure project alignment provide cited sustainable finance investment signals.",
      carbonCreditThesis:
        "Use AIIB's climate finance and project-screening evidence as transition-finance context; carbon credits should be evaluated at individual project level.",
      items: [
        {
          name: "Climate finance portfolio",
          category: "sustainable_finance",
          investmentType: "financing",
          amount: "Not disclosed",
          targetArea: "Climate finance and Green Infrastructure projects",
          expectedImpact: "Increase the share of climate finance and finance eligible mitigation, adaptation and climate-industry projects.",
          score: 68,
          carbonCreditRelevance: "Medium",
          carbonCreditPathway:
            "Portfolio signal only; assess carbon credit eligibility, ownership and retirement claims at underlying project level.",
          assessment: "Credible sustainable finance signal with useful transition context, but carbon credit use requires project-level diligence.",
          citations: [aiibCitations.sustainableEnergy],
        },
      ],
    },
    baseMarginNote:
      "150bps is a generic corporate placeholder. AIIB's actual sovereign lending spreads are lower (AAA-rated MDB). Adjust the base margin parameter to reflect the actual deal terms for accurate figures.",
  },
};
