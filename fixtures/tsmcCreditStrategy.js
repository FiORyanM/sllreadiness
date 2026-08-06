const citation = (quote, pages) => ({ quote, pages });

const evidenceProfile = {
  sector: "semiconductors",
  emissions: {
    year: 2024,
    scope1Tco2e: 1_826_000,
    scope2Tco2e: 10_957_000,
    scope3Tco2e: 8_223_000,
    targetBoundaryTco2e: 21_006_442,
    citations: [
      citation("In 2024, the Company's total GHG emission was 21,006,442 tCO2e.", [113]),
      citation("Scope 1 (Mt CO2e) Scope 2 (Mt CO2e) Scope 3 (Mt CO2e) Carbon offset (Mt CO2e) Total emission", [113]),
    ],
  },
  target: {
    baselineYear: 2024,
    targetYear: 2050,
    reductionPercent: 100,
    boundary: "scope1_scope2_scope3",
    targetEmissionsTco2e: 0,
    citations: [citation("To reach the target of net zero emissions by 2050", [109])],
  },
  projects: [
    {
      name: "Operational emissions abatement",
      lever: "other",
      interpretation: "Operational Scope 1 abatement through carbon-neutral natural gas and process controls.",
      requiredCapitalUsd: null,
      committedCapitalUsd: null,
      expectedAbatementTco2e: 390_000,
      deliveryYear: 2024,
      status: "operational",
      mrvReady: true,
      sourceCoverage: 0.78,
      citations: [citation("used carbon-neutral natural gases to reduce direct emissions of 390,000 tCO2e", [113])],
    },
    {
      name: "Renewable energy procurement",
      lever: "renewable_electricity",
      interpretation: "Contracted renewable electricity addresses TSMC's largest disclosed emissions source.",
      requiredCapitalUsd: null,
      committedCapitalUsd: null,
      expectedAbatementTco2e: 5_230_000,
      deliveryYear: 2025,
      status: "contracted",
      mrvReady: false,
      sourceCoverage: 0.94,
      citations: [
        citation("As of 2024, TSMC has cumulatively signed contracts for 4.4 GW of renewable energy procurement, which is estimated to reduce carbon emissions by approximately 5.23 million metric tons annually.", [117]),
      ],
    },
    {
      name: "Fab energy conservation program",
      lever: "energy_efficiency",
      interpretation: "Implemented fab efficiency measures reduce purchased-electricity demand and associated emissions.",
      requiredCapitalUsd: null,
      committedCapitalUsd: null,
      expectedAbatementTco2e: 400_000,
      deliveryYear: 2024,
      status: "operational",
      mrvReady: true,
      sourceCoverage: 0.88,
      citations: [
        citation("In 2024, TSMC implemented 1,177 energy conservation measures across eight categories, achieving a 15% energy-saving rate and conserving 810 GWh in electricity. Energy conserved in 2024 was the equivalent of reducing 400,000 metric tons of carbon emissions", [120]),
      ],
    },
    {
      name: "Supplier carbon reduction program",
      lever: "scope3_supply_chain",
      interpretation: "Supplier equipment support targets value-chain emissions; disclosed NT$ amounts are not converted into project-level USD capex.",
      requiredCapitalUsd: null,
      committedCapitalUsd: null,
      expectedAbatementTco2e: 450_000,
      deliveryYear: 2024,
      status: "operational",
      mrvReady: true,
      sourceCoverage: 0.82,
      citations: [
        citation("Provided a subsidy of NT$84 million to support suppliers in replacing or purchasing new equipment. A total of 26 suppliers passed the evaluation and brought an overall carbon reduction investment amount of NT$5.5 billion and a carbon reduction of 450,000 metric tons", [114]),
      ],
    },
  ],
  currentPortfolio: {
    disclosureStatus: "limited_disclosure",
    credits: [],
    citations: [
      citation("Carbon offset (Mt CO2e)", [113]),
      citation("0.004 0.242 0.616 0.617 0.627", [113]),
      citation("procure high-quality carbon credits", [109]),
    ],
  },
};

const questionnaire = {
  confirmedBoundary: true,
  publicClaimPlanned: false,
  useYear: 2030,
  annualBudgetUsd: null,
  riskAppetite: "balanced",
  maxUpfrontPercent: 30,
  costOfCapitalPercent: 8,
  demandVolumeTco2e: 627_000,
  demandConfidence: "Medium",
};

const frozenResult = Object.freeze({
  "frameworkVersion": "climate-capital-credit.v1",
  "generatedAt": "2026-08-06T00:00:00.000Z",
  "company": "TSMC",
  "market": {
    "version": "illustrative-semiconductor-v1.0.0",
    "asOfDate": "2026-07-29",
    "illustrative": true,
    "disclaimer": "Illustrative assumptions — not a market quote."
  },
  "managementConclusion": {
    "action": "Prepare only",
    "recommendedStrategy": "Wait & Spot",
    "reasons": [
      "Future demand is plausible but not sufficiently confirmed.",
      "Prepare the specification and approvals before committing capital."
    ],
    "conditions": [
      "Complete project capex and abatement ranges.",
      "Complete project-level CCP and contract due diligence before signing."
    ]
  },
  "scores": {
    "capitalAllocation": {
      "score": null,
      "band": "N/A",
      "confidence": "Low",
      "dimensions": {
        "fundingCoverage": {
          "score": null,
          "weight": 30,
          "explanation": "Project-level required and committed capital are needed."
        },
        "costEffectiveness": {
          "score": null,
          "weight": 25,
          "explanation": "Project-level required and committed capital are needed."
        },
        "timingAlignment": {
          "score": null,
          "weight": 20,
          "explanation": "Project-level required and committed capital are needed."
        },
        "sourceCoverage": {
          "score": null,
          "weight": 15,
          "explanation": "Project-level required and committed capital are needed."
        },
        "deliveryMrv": {
          "score": null,
          "weight": 10,
          "explanation": "Project-level required and committed capital are needed."
        }
      },
      "drivers": [],
      "highRisk": false
    },
    "currentPortfolio": {
      "score": null,
      "band": "N/A — no portfolio to score",
      "confidence": "Low",
      "dimensions": {},
      "drivers": [],
      "highRisk": false
    }
  },
  "investmentPriorities": [
    {
      "name": "Renewable energy procurement",
      "lever": "renewable_electricity",
      "requiredCapitalUsd": null,
      "committedCapitalUsd": null,
      "expectedAbatementTco2e": 5230000,
      "deliveryYear": 2025,
      "status": "contracted",
      "mrvReady": false,
      "sourceCoverage": 0.94,
      "citations": [
        {
          "quote": "As of 2024, TSMC has cumulatively signed contracts for 4.4 GW of renewable energy procurement, which is estimated to reduce carbon emissions by approximately 5.23 million metric tons annually.",
          "pages": [
            117
          ]
        }
      ],
      "fundingGapUsd": null,
      "costPerTco2e": null,
      "priorityScore": 51,
      "rationale": "5,230,000 tCO2e potential abatement; project capex not disclosed; delivery 2025."
    },
    {
      "name": "Operational emissions abatement",
      "lever": "other",
      "requiredCapitalUsd": null,
      "committedCapitalUsd": null,
      "expectedAbatementTco2e": 390000,
      "deliveryYear": 2024,
      "status": "operational",
      "mrvReady": true,
      "sourceCoverage": 0.78,
      "citations": [
        {
          "quote": "used carbon-neutral natural gases to reduce direct emissions of 390,000 tCO2e",
          "pages": [
            113
          ]
        }
      ],
      "fundingGapUsd": null,
      "costPerTco2e": null,
      "priorityScore": 48,
      "rationale": "390,000 tCO2e potential abatement; project capex not disclosed; delivery 2024."
    },
    {
      "name": "Fab energy conservation program",
      "lever": "energy_efficiency",
      "requiredCapitalUsd": null,
      "committedCapitalUsd": null,
      "expectedAbatementTco2e": 400000,
      "deliveryYear": 2024,
      "status": "operational",
      "mrvReady": true,
      "sourceCoverage": 0.88,
      "citations": [
        {
          "quote": "In 2024, TSMC implemented 1,177 energy conservation measures across eight categories, achieving a 15% energy-saving rate and conserving 810 GWh in electricity. Energy conserved in 2024 was the equivalent of reducing 400,000 metric tons of carbon emissions",
          "pages": [
            120
          ]
        }
      ],
      "fundingGapUsd": null,
      "costPerTco2e": null,
      "priorityScore": 48,
      "rationale": "400,000 tCO2e potential abatement; project capex not disclosed; delivery 2024."
    }
  ],
  "creditSpecification": {
    "useCase": "Beyond-value-chain contribution / future supply preparation",
    "qualityThreshold": "CCP-Approved credits where available; otherwise full CCP-equivalent project due diligence.",
    "types": [
      "High-integrity reductions for a near-term bridge",
      "Nature removals",
      "Early durable-removal tranche"
    ],
    "durability": "Increase removals and durable storage toward the net-zero use year; do not apply a fixed industry percentage.",
    "deliveryWindow": "2030-2032",
    "registryMethodology": "Named registry, methodology, vintage, serial tracking, independent verification and no-double-counting evidence required.",
    "procurementForm": "No purchase commitment; prepare an approved sourcing specification.",
    "retirementControls": "Retire credits for the relevant reporting period before making a compensation claim; preserve ownership and assurance evidence.",
    "exclusions": [
      "Unspecified registry or methodology",
      "No ownership or replacement remedy",
      "Double-counting concern",
      "Credits used to substitute internal reduction"
    ],
    "proposedMix": [
      {
        "key": "methane_industrial",
        "share": 60
      },
      {
        "key": "nature_removal",
        "share": 25
      },
      {
        "key": "durable_removal",
        "share": 15
      }
    ]
  },
  "demand": {
    "basis": "Confirmed planning volume for contribution or future supply",
    "confidence": "Medium",
    "years": [
      {
        "year": 2030,
        "volumeTco2e": 627000
      },
      {
        "year": 2031,
        "volumeTco2e": 627000
      },
      {
        "year": 2032,
        "volumeTco2e": 627000
      }
    ]
  },
  "procurementScenarios": [
    {
      "key": "wait_spot",
      "label": "Wait & Spot",
      "nominalCostUsd": 98889186,
      "npvCostUsd": 67113042,
      "weightedAverageUsdPerTco2e": 52.57266666666667,
      "securedVolumeTco2e": 0,
      "deliveryAtRiskTco2e": 0,
      "replacementCostExposureUsd": 0,
      "totalDemandTco2e": 1881000,
      "annualCashflows": [
        {
          "year": 2026,
          "amountUsd": 0
        },
        {
          "year": 2029,
          "amountUsd": 0
        },
        {
          "year": 2030,
          "amountUsd": 29939250
        },
        {
          "year": 2031,
          "amountUsd": 32861070
        },
        {
          "year": 2032,
          "amountUsd": 36088866
        }
      ],
      "recommended": true,
      "potentialNpvSavingVsWaitUsd": 0
    },
    {
      "key": "staged",
      "label": "Staged Procurement",
      "nominalCostUsd": 101855862,
      "npvCostUsd": 71243708,
      "weightedAverageUsdPerTco2e": 54.149846666666676,
      "securedVolumeTco2e": 1128600,
      "deliveryAtRiskTco2e": 90288,
      "replacementCostExposureUsd": 5933351,
      "totalDemandTco2e": 1881000,
      "annualCashflows": [
        {
          "year": 2026,
          "amountUsd": 5636684
        },
        {
          "year": 2029,
          "amountUsd": 1706537
        },
        {
          "year": 2030,
          "amountUsd": 29297434
        },
        {
          "year": 2031,
          "amountUsd": 32157805
        },
        {
          "year": 2032,
          "amountUsd": 33057401
        }
      ],
      "recommended": false,
      "potentialNpvSavingVsWaitUsd": -4130666
    },
    {
      "key": "secure_early",
      "label": "Secure Early / Offtake",
      "nominalCostUsd": 102844753,
      "npvCostUsd": 77434353,
      "weightedAverageUsdPerTco2e": 54.67557333333334,
      "securedVolumeTco2e": 1504800,
      "deliveryAtRiskTco2e": 180576,
      "replacementCostExposureUsd": 11866702,
      "totalDemandTco2e": 1881000,
      "annualCashflows": [
        {
          "year": 2026,
          "amountUsd": 21360064
        },
        {
          "year": 2029,
          "amountUsd": 4311252
        },
        {
          "year": 2030,
          "amountUsd": 25090684
        },
        {
          "year": 2031,
          "amountUsd": 27542324
        },
        {
          "year": 2032,
          "amountUsd": 24540429
        }
      ],
      "recommended": false,
      "potentialNpvSavingVsWaitUsd": -10321311
    }
  ],
  "evidenceProfile": {
    "sector": "semiconductors",
    "emissions": {
      "year": 2024,
      "scope1Tco2e": 1826000,
      "scope2Tco2e": 10957000,
      "scope3Tco2e": 8223000,
      "targetBoundaryTco2e": 21006442,
      "citations": [
        {
          "quote": "In 2024, the Company's total GHG emission was 21,006,442 tCO2e.",
          "pages": [
            113
          ]
        },
        {
          "quote": "Scope 1 (Mt CO2e) Scope 2 (Mt CO2e) Scope 3 (Mt CO2e) Carbon offset (Mt CO2e) Total emission",
          "pages": [
            113
          ]
        }
      ]
    },
    "target": {
      "baselineYear": 2024,
      "targetYear": 2050,
      "reductionPercent": 100,
      "boundary": "scope1_scope2_scope3",
      "targetEmissionsTco2e": 0,
      "citations": [
        {
          "quote": "To reach the target of net zero emissions by 2050",
          "pages": [
            109
          ]
        }
      ]
    },
    "targetGapTco2e": 21006442,
    "projects": [
      {
        "name": "Operational emissions abatement",
        "lever": "other",
        "requiredCapitalUsd": null,
        "committedCapitalUsd": null,
        "expectedAbatementTco2e": 390000,
        "deliveryYear": 2024,
        "status": "operational",
        "mrvReady": true,
        "sourceCoverage": 0.78,
        "citations": [
          {
            "quote": "used carbon-neutral natural gases to reduce direct emissions of 390,000 tCO2e",
            "pages": [
              113
            ]
          }
        ]
      },
      {
        "name": "Renewable energy procurement",
        "lever": "renewable_electricity",
        "requiredCapitalUsd": null,
        "committedCapitalUsd": null,
        "expectedAbatementTco2e": 5230000,
        "deliveryYear": 2025,
        "status": "contracted",
        "mrvReady": false,
        "sourceCoverage": 0.94,
        "citations": [
          {
            "quote": "As of 2024, TSMC has cumulatively signed contracts for 4.4 GW of renewable energy procurement, which is estimated to reduce carbon emissions by approximately 5.23 million metric tons annually.",
            "pages": [
              117
            ]
          }
        ]
      },
      {
        "name": "Fab energy conservation program",
        "lever": "energy_efficiency",
        "requiredCapitalUsd": null,
        "committedCapitalUsd": null,
        "expectedAbatementTco2e": 400000,
        "deliveryYear": 2024,
        "status": "operational",
        "mrvReady": true,
        "sourceCoverage": 0.88,
        "citations": [
          {
            "quote": "In 2024, TSMC implemented 1,177 energy conservation measures across eight categories, achieving a 15% energy-saving rate and conserving 810 GWh in electricity. Energy conserved in 2024 was the equivalent of reducing 400,000 metric tons of carbon emissions",
            "pages": [
              120
            ]
          }
        ]
      },
      {
        "name": "Supplier carbon reduction program",
        "lever": "scope3_supply_chain",
        "requiredCapitalUsd": null,
        "committedCapitalUsd": null,
        "expectedAbatementTco2e": 450000,
        "deliveryYear": 2024,
        "status": "operational",
        "mrvReady": true,
        "sourceCoverage": 0.82,
        "citations": [
          {
            "quote": "Provided a subsidy of NT$84 million to support suppliers in replacing or purchasing new equipment. A total of 26 suppliers passed the evaluation and brought an overall carbon reduction investment amount of NT$5.5 billion and a carbon reduction of 450,000 metric tons",
            "pages": [
              114
            ]
          }
        ]
      }
    ],
    "currentPortfolio": {
      "disclosureStatus": "limited_disclosure",
      "credits": [],
      "citations": [
        {
          "quote": "Carbon offset (Mt CO2e)",
          "pages": [
            113
          ]
        },
        {
          "quote": "0.004 0.242 0.616 0.617 0.627",
          "pages": [
            113
          ]
        },
        {
          "quote": "procure high-quality carbon credits",
          "pages": [
            109
          ]
        }
      ]
    }
  },
  "questionnaire": {
    "confirmedBoundary": true,
    "publicClaimPlanned": false,
    "useYear": 2030,
    "annualBudgetUsd": null,
    "riskAppetite": "balanced",
    "maxUpfrontPercent": 30,
    "costOfCapitalPercent": 8,
    "demandVolumeTco2e": 627000,
    "demandConfidence": "Medium"
  },
  "sources": [
    {
      "name": "ICVCM Core Carbon Principles",
      "url": "https://icvcm.org/core-carbon-principles/"
    },
    {
      "name": "VCMI Claims Code guidance",
      "url": "https://vcmintegrity.org/guides-tutorials/steps-to-making-a-carbon-integrity-claim-2/"
    },
    {
      "name": "Oxford Principles",
      "url": "https://climate.web.ox.ac.uk/publication/2127012/ora-hyrax"
    }
  ]
}
);

export const tsmcCreditStrategyFixture = Object.freeze({
  demoMode: "precomputed",
  sourceLabel: "TSMC 2024 Sustainability Report",
  sourcePageCount: 278,
  generatedAt: "2026-08-06T00:00:00.000Z",
  evidenceMapping: {
    mode: "one-time-ai-classification-with-human-citation-review",
    promptVersion: "credit-evidence-map.v1",
  },
  assumptions: [
    "The reported 2024 carbon offset of approximately 627,000 tCO2e is used only as a three-year planning-volume proxy.",
    "The planning use year is 2030; risk appetite is balanced; maximum upfront payment is 30%; cost of capital is 8%.",
    "Credit prices and escalation are illustrative market assumptions, not a quote.",
    "TSMC project capex, credit budget, registry, methodology and contract terms remain undisclosed and are not estimated.",
  ],
  input: Object.freeze({ evidenceProfile, questionnaire, startYear: 2030 }),
  result: frozenResult,
});
