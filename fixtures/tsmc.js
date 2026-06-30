const cite = (quote, pages) => ({ quote, pages });

const tsmcCitations = {
  renewableEnergy: cite("Renewable energy used at all TSMC fab operation sites (%) 10.4% 11.2% 14.1%", [267]),
  ghgIntensity: cite("Reduction rate of GHG emissions per unit product compared to the base year", [266]),
  supplierCoverage: cite("High-energy-consumption suppliers that have received ISO14064 certification for GHG emissions (%) (Base year: 2021) 65% 84% 90%", [266]),
  supplierCdp: cite("Score and reponse rate of suppliers invited to participate in the CDP (Carbon Disclosure Project) in the year C / 81% B- / 98% B- / 100%", [266]),
  energySaving: cite("Cumulative energy-saving rate from 2016 to 2030 through new energy-saving measures (%) 13% 14% 15%", [267]),
  assurance: cite("The Parent Company 1,581,312 0.0006 10,926,644 0.0038 DNV Reasonable level", [260]),
  strategy: cite("Promised 60% renewable energy coverage in 2030", [117]),
  renewableInvestment: cite("cumulatively signed contracts for 4.4 GW of renewable energy procurement", [117]),
  energyEfficiencyInvestment: cite("15% energy-saving rate and conserving 810 GWh", [120]),
};

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
      kpiDataHistory: { name: "KPI data history", score: 94, maturity: "high", status: "High", citations: [tsmcCitations.ghgIntensity] },
      kpiMethodology: { name: "KPI methodology", score: 92, maturity: "high", status: "High", citations: [tsmcCitations.energySaving] },
      reportingInfrastructure: { name: "Reporting infrastructure", score: 90, maturity: "high", status: "High", citations: [tsmcCitations.renewableEnergy] },
      externalVerification: { name: "External verification", score: 94, maturity: "high", status: "High", citations: [tsmcCitations.assurance] },
      strategicAlignment: { name: "Strategic alignment", score: 78, maturity: "high", status: "High", citations: [tsmcCitations.strategy] },
    },
  },
  analysis: {
    kpis: [
      {
        name: "Renewable energy use",
        evidence: "Renewable energy used at all fab operation sites rose from 10.4% to 11.2% to 14.1% across 2022-2024.",
        status: "Ready",
        citations: [tsmcCitations.renewableEnergy],
      },
      {
        name: "Scope 1 and 2 GHG emissions intensity",
        evidence:
          "2024 unit GHG emissions were 19% above the 2020 base year, so this KPI needs careful SPT calibration.",
        status: "Partial",
        citations: [tsmcCitations.ghgIntensity],
      },
      {
        name: "Supplier carbon management coverage",
        evidence:
          "High-energy-consumption suppliers with ISO 14064 certification reached 90% in 2024; supplier CDP response rate reached 100%.",
        status: "Ready",
        citations: [tsmcCitations.supplierCoverage],
      },
      {
        name: "Cumulative energy-saving rate",
        evidence: "Cumulative energy-saving rate from 2016 to 2030 reached 15% in 2024 against an 18% 2030 goal.",
        status: "Ready",
        citations: [tsmcCitations.energySaving],
      },
    ],
    gaps: [
      {
        title: "Unit GHG emissions target needs careful SPT calibration",
        description:
          "TSMC missed its 2024 unit GHG reduction target, so an SLL SPT should be calibrated with credible annual pathways and transition levers.",
        severity: "Medium",
        citations: [tsmcCitations.ghgIntensity],
      },
      {
        title: "Renewable energy trajectory requires acceleration",
        description:
          "2024 renewable energy use reached 14.1% of total power consumption against a 2030 goal of 60%, making annual SPT pacing important.",
        severity: "Medium",
        citations: [tsmcCitations.renewableEnergy],
      },
      {
        title: "Scope 3 and supplier decarbonization remain material",
        description:
          "Scope 3 emissions and supplier performance are material to semiconductor value-chain transition and should be reviewed before use as loan KPIs.",
        severity: "Medium",
        citations: [tsmcCitations.supplierCdp],
      },
    ],
    sustainabilityInvestments: {
      summary: "Renewable energy and energy-saving programs provide cited internal decarbonization investment signals.",
      carbonCreditThesis:
        "Use renewable energy and efficiency programs to size residual emissions risk; carbon credits should supplement, not replace, internal reductions.",
      items: [
        {
          name: "Renewable energy and energy-saving program",
          category: "renewable_energy",
          investmentType: "procurement",
          amount: "Not disclosed",
          targetArea: "Renewable electricity and energy-efficiency improvements",
          expectedImpact: "Increase renewable energy use and cumulative energy savings toward 2030 climate goals.",
          score: 76,
          carbonCreditRelevance: "Medium",
          carbonCreditPathway:
            "Internal reduction lever; estimate residual emissions after renewable energy and efficiency actions before carbon credit procurement.",
          assessment: "Credible decarbonization program with clear KPI links, but project-level cost and impact evidence would improve carbon credit analysis.",
          citations: [tsmcCitations.renewableInvestment, tsmcCitations.energyEfficiencyInvestment],
        },
      ],
    },
    baseMarginNote:
      "150bps is a generic corporate placeholder. Replace with TSMC-specific financing assumptions for decision-useful economics.",
  },
};
