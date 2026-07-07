import { sllWeights } from "./models/scoringModel.js";
import {
  sustainabilityInvestmentCriteria,
  sustainabilityInvestmentFrameworkVersion,
} from "./models/sustainabilityInvestmentModel.js";

const investmentLooksFor = {
  useOfProceedsClarity: "A named investment and where money will be spent.",
  decarbonizationLink: "A direct connection to emissions reduction or transition.",
  quantification: "Money, capacity, energy or emissions impact is quantified.",
  deliveryStatus: "Evidence that the project is approved, underway or complete.",
  verification: "External standards, certification, assurance or auditability.",
  carbonCreditFit: "Whether it reduces internal emissions or could potentially generate credits.",
};

const investmentExamples = {
  useOfProceedsClarity: "USD 50M solar capex for three manufacturing sites.",
  decarbonizationLink: "Solar project replaces grid electricity and lowers Scope 2 emissions.",
  quantification: "25 MW, 40 GWh/year and 20,000 tCO2e avoided annually.",
  deliveryStatus: "Board-approved in 2025; construction underway; completion in 2027.",
  verification: "ISO 14064 assurance or certified renewable-electricity records.",
  carbonCreditFit:
    "Energy efficiency is an internal reduction; a removal project may be credit supply after registry and additionality review.",
};

export const frameworkContent = {
  title: "Analysis Framework Admin",
  subtitle:
    "Hidden internal view for the current MVP framework. It explains how cited ESG evidence is translated into SLL readiness signals and the separate sustainability investment / carbon-credit lens.",
  coreIdea:
    "Strong ESG disclosure is not enough by itself. A potential SLL needs measurable KPIs, credible target calibration, repeatable reporting, independent verification and business relevance.",
  sllDimensions: [
    {
      key: "kpiDataHistory",
      label: "KPI data history",
      question: "Is there enough historical performance data to judge progress?",
      looksFor: "A baseline plus enough annual data to judge progress and target ambition.",
      example:
        "FY2022 baseline and FY2022-FY2025 Scope 1 and 2 emissions values reported on a consistent basis.",
      explanation:
        "An SLL needs a performance baseline and enough history to show whether a target is meaningful. Without history, it is hard to tell whether the company is improving, standing still, or choosing an easy target.",
      weakEvidence:
        "The KPI may still be useful, but the company may need to collect more data or choose a metric with a stronger track record.",
    },
    {
      key: "kpiMethodology",
      label: "KPI methodology",
      question: "Are the metrics clearly defined, measurable and comparable?",
      looksFor: "Clear scope, unit, boundary, formula, standard, exclusions and recalculation rules.",
      example:
        "GHG Protocol; market-based Scope 2; tCO2e per USD million revenue; subsidiaries and exclusions defined.",
      explanation:
        "The metric must be clearly defined so everyone measures the same thing over the loan term. This includes scope, boundary, calculation method, units, baseline year and any exclusions.",
      weakEvidence:
        "The company may have a good sustainability goal, but it is not yet precise enough to become a loan KPI.",
    },
    {
      key: "reportingInfrastructure",
      label: "Reporting infrastructure",
      question: "Can the company report progress reliably during the loan?",
      looksFor: "A repeatable process to collect, control and report KPI performance during the loan.",
      example:
        "Annual sustainability reporting, named KPI owner, documented controls and annual lender reporting process.",
      explanation:
        "The borrower must be able to report KPI performance regularly and consistently. A lender needs confidence that progress can be monitored after signing, not only described once in an annual report.",
      weakEvidence:
        "The company may need clearer owners, systems, controls or reporting timelines before the KPI is lender-ready.",
    },
    {
      key: "externalVerification",
      label: "External verification",
      question: "Is there assurance today, or a credible path to independent verification?",
      looksFor: "Independent review covering the relevant KPI and future SPT performance.",
      example:
        "Qualified assurance provider gives limited assurance over the KPI and verifies annual SPT results.",
      explanation:
        "Independent review gives lenders confidence that KPI performance has been checked. Existing assurance is helpful, but the key question is whether the relevant SLL KPI and target can be verified during the loan.",
      weakEvidence:
        "The company may need to appoint a verifier, expand assurance scope, or define verification procedures.",
    },
    {
      key: "strategicAlignment",
      label: "Strategic alignment",
      question: "Are the KPIs material to the business and sustainability strategy?",
      looksFor: "A KPI that is material to the sector, business model, transition plan and governance.",
      example:
        "Semiconductor emissions intensity linked to energy use, board-approved climate targets and transition capex.",
      explanation:
        "The KPI should matter to the company's business model, sector and sustainability strategy. A target is stronger when it connects to material risks, transition plans, capital allocation or core operations.",
      weakEvidence:
        "The KPI may look measurable but feel peripheral, which can reduce lender confidence in ambition and relevance.",
    },
  ].map((dimension) => ({
    ...dimension,
    weight: sllWeights[dimension.key],
    weightLabel: `${Math.round((sllWeights[dimension.key] ?? 0) * 100)}%`,
  })),
  scoreExplanation: {
    summary:
      "Each dimension receives a score from 0 to 100 based on the evidence found in the report. The final readiness score is a weighted average.",
    weighting:
      "History and methodology receive the most weight because they establish whether a target can be defended. Reporting and verification come next because lenders need confidence that performance can be monitored and checked after signing. Strategic alignment receives a smaller, but still important, weight because a KPI should be relevant to the company's business and sustainability priorities.",
    interpretation:
      "High means cited evidence appears strong enough for detailed review. Medium means the company may be viable but has gaps to close. Low means the company should first strengthen KPI evidence, reporting and verification foundations.",
  },
  evidenceRule:
    "No citation means no positive assessment. Every component, KPI and reported gap must be supported by a quoted source and PDF page number. If support is missing, the result becomes Insufficient evidence; an unsupported gap is omitted.",
  extractionNote:
    "The tool performs AI-assisted first-pass document extraction. It looks for relevant company information, KPI evidence, targets, assurance language, reporting signals and possible gaps. The analysis is only as strong as the text available in the uploaded report, so users should treat the output as a structured starting point for review rather than a final expert judgment.",
  investmentLens: {
    frameworkVersion: sustainabilityInvestmentFrameworkVersion,
    summary:
      "The latest MVP also reviews explicitly cited sustainability investments, projects, capex, procurement, offsets or credit activity. This is a separate assessment and does not change the five-component SLL readiness score.",
    interpretation:
      "Internal decarbonization comes first. Carbon credits are considered for residual or hard-to-abate emissions, or as a possible project-supply pathway where eligibility can be demonstrated.",
    criteria: sustainabilityInvestmentCriteria.map((criterion) => ({
      ...criterion,
      weightLabel: `${criterion.weight}%`,
      looksFor: investmentLooksFor[criterion.key],
      example: investmentExamples[criterion.key],
    })),
  },
  presenterSentence:
    "The tool does not decide whether a borrower qualifies for an SLL. It organizes cited evidence into a readiness view, shows what needs human review, and tests whether illustrative deal economics could justify further structuring work.",
};
