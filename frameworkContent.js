import { sllWeights } from "./models/scoringModel.js";
import {
  carbonPortfolioWeights,
  internalInvestmentWeights,
  sustainabilityAnalysisFrameworkVersion,
} from "./models/sustainabilityAnalysisModel.js";

const investmentCriteria = [
  criterion("internal.targetGapCoverage", "Internal — target-gap coverage", internalInvestmentWeights.targetGapCoverage, "Quantified abatement compared with a matching-boundary target gap.", "Project abatement covers 70% of the remaining Scope 1 and 2 target gap."),
  criterion("internal.capitalCommitment", "Internal — capital commitment", internalInvestmentWeights.capitalCommitment, "Comparable investment intensity with cited numerator and denominator.", "Transition capex as a share of total capex, compared only with peers using the same denominator."),
  criterion("internal.materialityAlignment", "Internal — materiality alignment", internalInvestmentWeights.materialityAlignment, "Investment addresses material emissions sources and the disclosed target.", "Renewable electricity investment addresses a material Scope 2 source."),
  criterion("internal.deliveryStatus", "Internal — delivery status", internalInvestmentWeights.deliveryStatus, "Approval, implementation, contracting or completion evidence.", "Board-approved project is underway with a disclosed completion year."),
  criterion("internal.governanceVerification", "Internal — governance / verification", internalInvestmentWeights.governanceVerification, "Ownership, assurance, standards and project-level controls.", "Expected impact and delivery records are externally assured."),
  criterion("carbon.volumeCoverage", "Credits — volume coverage", carbonPortfolioWeights.volumeCoverage, "Purchased, contracted or retired volume over matching residual emissions.", "Retired volume is compared with disclosed ongoing emissions, not total market volume."),
  criterion("carbon.creditIntegrity", "Credits — integrity", carbonPortfolioWeights.creditIntegrity, "Registry, methodology, verification, additionality and double-counting controls.", "Registry and methodology are named and the intended claim is traceable."),
  criterion("carbon.clientSectorFit", "Credits — client / sector fit", carbonPortfolioWeights.clientSectorFit, "Portfolio categories fit the client's residual-emissions context.", "Project selection reflects client geography, risk and hard-to-abate emissions."),
  criterion("carbon.removalTrajectory", "Credits — removal trajectory", carbonPortfolioWeights.removalTrajectory, "Progressive shift toward removals and durable storage without a universal fixed percentage.", "Future procurement increases durable removal exposure toward the net-zero year."),
  criterion("carbon.procurementClaims", "Credits — procurement / claims", carbonPortfolioWeights.procurementClaims, "Contracting, delivery, retirement, ownership and claim controls.", "Offtake terms and retirement evidence support the intended public claim."),
];

function criterion(key, label, weight, looksFor, example) {
  return { key, label, weight, looksFor, example };
}

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
    frameworkVersion: sustainabilityAnalysisFrameworkVersion,
    summary:
      "The optional deep analysis separately rates internal decarbonization investment and carbon-credit portfolio adequacy. Peer percentiles require at least three comparable disclosures and do not change the five-component SLL readiness score.",
    interpretation:
      "Internal decarbonization comes first. Missing disclosure produces Not assessable rather than a weak score; explicit zero activity remains a substantive data point. Credits are considered for residual or hard-to-abate emissions with integrity, retirement and claims controls.",
    criteria: investmentCriteria.map((criterion) => ({
      ...criterion,
      weightLabel: `${criterion.weight}%`,
    })),
  },
  presenterSentence:
    "The tool does not decide whether a borrower qualifies for an SLL. It organizes cited evidence into a readiness view, shows what needs human review, and tests whether illustrative deal economics could justify further structuring work.",
};
