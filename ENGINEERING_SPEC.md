# ESG-to-Green-Finance Readiness Report - Prototype Engineering Spec

## 1. Product Summary

Build a borrower-facing prototype that lets a company upload an ESG report and receive an indicative green finance readiness report.

The report should show:

- Whether the company is better suited for a sustainability-linked loan, green loan, or both.
- Which ESG and financing-readiness gaps need to be closed.
- How carbon credits could support target achievement and strengthen the financing narrative.
- Estimated financing savings versus indicative carbon credit cost.
- A prioritized action plan for becoming lender-ready.

The prototype is not a carbon credit marketplace and does not execute procurement. It should stop at recommendation, estimation, and lead-generation/onboarding.

## 2. Target User

Borrower-side companies in Singapore, Hong Kong, and Asia that already publish ESG or sustainability reports but do not know whether those reports can support access to green loans or sustainability-linked loans.

Primary user roles:

- CFO / treasury team
- Sustainability team
- Corporate strategy team
- ESG reporting manager

## 3. Prototype Goal

The prototype should help a potential client reach this conclusion:

"Our existing ESG data may support green financing, but we have gaps. Carbon credits could help address residual emissions or target-achievement risk, and we should speak to the provider."

## 4. Prototype Scope

### In Scope

- ESG report upload flow.
- Basic PDF/text extraction.
- Manual fallback form for missing inputs.
- Indicative extraction of ESG metrics.
- Green finance fit assessment.
- SLL readiness scoring.
- Green loan opportunity screening.
- Carbon credit need estimation.
- Savings simulation.
- Generated on-screen and downloadable report.
- Lead capture / consultation call-to-action.

### Out Of Scope

- Actual carbon credit purchase.
- Registry integration.
- Real lender matching.
- Formal legal, financial, or verification advice.
- Full dashboard.
- User accounts, unless needed by the prototype platform.
- Long-term storage of sensitive uploaded reports.

## 5. Recommended Prototype Architecture

Use a modular architecture even if the UI is simple.

Suggested layers:

- `Upload Layer`: accepts ESG report files.
- `Extraction Layer`: extracts text and candidate ESG metrics.
- `Assessment Layer`: runs scoring and gap logic.
- `Recommendation Layer`: produces carbon credit and action recommendations.
- `Simulation Layer`: estimates financing savings and net benefit.
- `Report Layer`: renders the final borrower-facing report.

The first version may use mocked or rules-based extraction, but the output should be structured so an LLM/parser can replace or improve extraction later.

## 6. User Flow

### Step 1: Landing / Start

Purpose: Quickly explain the tool and get the user to upload.

Required UI:

- Product title.
- One-sentence value proposition.
- Upload button.
- Optional sample report/demo button.

Suggested copy:

"Upload your ESG report to estimate green loan/SLL readiness, financing upside, and how carbon credits may support your transition plan."

### Step 2: Upload ESG Report

Required inputs:

- ESG report PDF upload.

Accepted formats for prototype:

- `.pdf`
- Optional: `.txt`, `.docx` if easy.

Prototype behavior:

- Extract text from the uploaded document.
- If extraction fails, allow the user to continue with manual inputs or sample data.

### Step 3: Basic Company And Financing Inputs

Ask for:

- Company name.
- Industry.
- Primary geography.
- Loan size.
- Loan term.
- Current interest rate or loan margin.
- Preferred product, if known:
  - Not sure
  - Green loan
  - Sustainability-linked loan
  - Both

Default assumptions:

- Currency: USD or HKD/SGD selectable.
- Loan term: 5 years.
- Pricing benefit scenarios:
  - Conservative: 5 bps
  - Base: 10 bps
  - Upside: 15 bps

### Step 4: Extracted ESG Data Review

Show detected values and allow editing.

Fields:

- Reporting year.
- Baseline year.
- Scope 1 emissions.
- Scope 2 emissions.
- Scope 3 emissions.
- Total emissions.
- Emissions reduction target.
- Target year.
- Renewable energy percentage.
- Existing carbon credit / offset usage.
- Third-party assurance status.
- Climate-related capex / green projects.
- Existing science-based target or equivalent target.

Each field should support:

- Extracted value.
- Source confidence: high / medium / low.
- User override.
- "Not available" state.

### Step 5: Analysis

System runs:

- Green finance product fit.
- SLL readiness analysis.
- Green loan opportunity screen.
- Gap analysis.
- Carbon credit recommendation.
- Savings simulation.

### Step 6: Report Result

Display report on screen and allow download.

Required CTAs:

- "Download Report"
- "Discuss Carbon Credit Strategy"
- "Improve Analysis With More Data"

## 7. Report Structure

### 7.1 Executive Summary

Show:

- Overall readiness score.
- Best-fit financing route.
- Estimated financing savings range.
- Estimated carbon credit need.
- Top three recommended actions.

Example:

- Overall readiness: 68/100 - Promising, gaps to close.
- Best fit: Sustainability-linked loan.
- Potential savings: USD 250,000 to USD 375,000 over 5 years.
- Indicative credit need: 8,000 to 12,000 tCO2e.
- Priority actions:
  - Strengthen Scope 3 disclosure.
  - Obtain third-party assurance.
  - Use high-quality credits for residual emissions while prioritizing internal reductions.

### 7.2 Company ESG Snapshot

Show:

- Company name.
- Industry.
- Geography.
- Reporting year.
- Emissions profile.
- Climate targets.
- Existing green projects.
- Assurance status.

### 7.3 Green Finance Fit

Show:

- SLL fit score.
- Green loan fit score.
- Recommended route:
  - SLL first
  - Green loan first
  - Both possible
  - Not ready yet

Decision rule for prototype:

- Favor SLL when company-level emissions targets and KPIs are available.
- Favor green loan when project-level green capex/use-of-proceeds information is available.
- Recommend both when both company-level targets and eligible project data are strong.

### 7.4 SLL Readiness

Assess:

- KPI materiality.
- Baseline availability.
- Target ambition.
- Target timeline.
- Emissions trajectory.
- Verification readiness.
- Reporting consistency.

Output:

- Proposed KPI candidates.
- Suggested SPT candidates.
- Missing evidence.
- Risk level for target achievement.

Example suggested SPT:

"Reduce combined Scope 1 and 2 emissions intensity by 25% by 2030 from a 2023 baseline, supported by operational reductions, renewable electricity procurement, and high-quality credits for residual emissions."

### 7.5 Green Loan Opportunity Screen

Assess:

- Eligible green projects.
- Use-of-proceeds clarity.
- Project selection process.
- Proceeds tracking.
- Impact reporting.
- External review readiness.

Output:

- Potential eligible project categories.
- Missing documentation.
- Whether green loan route is viable now or should be deferred.

### 7.6 Carbon Credit Strategy

This is a central section.

Show:

- Estimated residual emissions or target-achievement gap.
- Indicative annual credit volume.
- Indicative credit cost range.
- Recommended credit quality criteria.
- Suitable credit categories.
- How credits can support the green finance narrative.

Required positioning:

- Internal reductions come first.
- Credits should support residual or hard-to-abate emissions.
- Credits should not be presented as a substitute for operational decarbonization.
- Credits can help manage target-achievement risk and demonstrate a credible transition plan.

Credit quality criteria:

- Recognized registry or standard.
- Third-party verification.
- Additionality.
- Permanence or durability.
- No double counting.
- Transparent methodology.
- Appropriate vintage.
- Relevant co-benefits where available.

### 7.7 Savings Simulation

Inputs:

- Loan size.
- Loan term.
- Pricing benefit in basis points.
- Carbon credit volume.
- Carbon credit price.

Formula:

`gross_savings = loan_size * (bps_reduction / 10000) * loan_term_years`

`credit_cost = credit_volume_tco2e * credit_price_per_tonne`

`net_benefit = gross_savings - credit_cost`

Show three scenarios:

- Conservative.
- Base.
- Upside.

### 7.8 Priority Action Plan

Rank recommendations:

1. Improve internal emissions reductions.
2. Close ESG data gaps.
3. Define SLL KPIs/SPTs.
4. Prepare green use-of-proceeds evidence if relevant.
5. Obtain third-party assurance or verification.
6. Use high-quality credits for residual emissions.
7. Prepare lender-ready green finance framework.

### 7.9 Data Gaps And Verification Needs

Examples:

- Missing Scope 3 emissions.
- No baseline year.
- No target year.
- No third-party assurance.
- No methodology disclosure.
- No project-level impact reporting.
- No carbon credit quality disclosure.

### 7.10 Disclaimer

Required text:

"This report is an indicative readiness assessment only. It is not financial, legal, tax, accounting, or verification advice. Final eligibility, pricing, and structure depend on lender requirements, external review, borrower credit profile, market conditions, and applicable regulations. Carbon credits should complement, not replace, internal emissions reductions."

## 8. Data Model

Use these objects internally.

### 8.1 CompanyProfile

```ts
type CompanyProfile = {
  companyName: string;
  industry: string;
  geography: string;
  currency: "USD" | "HKD" | "SGD";
};
```

### 8.2 FinancingInputs

```ts
type FinancingInputs = {
  loanSize: number;
  loanTermYears: number;
  currentRatePercent?: number;
  preferredProduct: "not_sure" | "green_loan" | "sll" | "both";
};
```

### 8.3 ExtractedESGMetrics

```ts
type ExtractedESGMetrics = {
  reportingYear?: number;
  baselineYear?: number;
  scope1EmissionsTco2e?: number;
  scope2EmissionsTco2e?: number;
  scope3EmissionsTco2e?: number;
  totalEmissionsTco2e?: number;
  emissionsReductionTargetPercent?: number;
  targetYear?: number;
  renewableEnergyPercent?: number;
  hasThirdPartyAssurance?: boolean;
  hasCarbonCreditUsage?: boolean;
  carbonCreditsUsedTco2e?: number;
  greenProjects?: GreenProject[];
  extractionConfidence: "high" | "medium" | "low";
  missingFields: string[];
};
```

### 8.4 GreenProject

```ts
type GreenProject = {
  name: string;
  category:
    | "renewable_energy"
    | "energy_efficiency"
    | "green_buildings"
    | "clean_transport"
    | "water"
    | "waste"
    | "pollution_prevention"
    | "other";
  estimatedCapex?: number;
  expectedImpact?: string;
};
```

### 8.5 AssessmentScores

```ts
type AssessmentScores = {
  overallReadinessScore: number;
  sllFitScore: number;
  greenLoanFitScore: number;
  dataCompletenessScore: number;
  verificationReadinessScore: number;
  carbonCreditOpportunityScore: number;
  recommendedRoute: "sll_first" | "green_loan_first" | "both" | "not_ready";
};
```

### 8.6 CarbonCreditRecommendation

```ts
type CarbonCreditRecommendation = {
  estimatedResidualEmissionsTco2e: number;
  suggestedCreditVolumeLowTco2e: number;
  suggestedCreditVolumeHighTco2e: number;
  indicativePriceLow: number;
  indicativePriceHigh: number;
  estimatedCostLow: number;
  estimatedCostHigh: number;
  recommendedCreditCategories: string[];
  qualityCriteria: string[];
  narrative: string;
};
```

### 8.7 SavingsScenario

```ts
type SavingsScenario = {
  label: "conservative" | "base" | "upside";
  bpsReduction: number;
  grossSavings: number;
  estimatedCreditCost: number;
  netBenefit: number;
};
```

### 8.8 GeneratedReport

```ts
type GeneratedReport = {
  companyProfile: CompanyProfile;
  financingInputs: FinancingInputs;
  extractedMetrics: ExtractedESGMetrics;
  scores: AssessmentScores;
  gaps: Gap[];
  carbonCreditRecommendation: CarbonCreditRecommendation;
  savingsScenarios: SavingsScenario[];
  actionPlan: ActionItem[];
  generatedAt: string;
};
```

### 8.9 Gap

```ts
type Gap = {
  category:
    | "data"
    | "target"
    | "verification"
    | "green_loan"
    | "sll"
    | "carbon_credit"
    | "reporting";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  recommendedAction: string;
};
```

### 8.10 ActionItem

```ts
type ActionItem = {
  priority: number;
  title: string;
  description: string;
  ownerHint: "sustainability" | "treasury" | "finance" | "legal" | "external_advisor";
};
```

## 9. Prototype Scoring Logic

### 9.1 Overall Readiness Score

Weights:

- ESG data completeness: 20%.
- Target quality: 20%.
- SLL suitability: 20%.
- Green loan suitability: 15%.
- Verification readiness: 10%.
- Carbon credit opportunity clarity: 10%.
- Reporting quality: 5%.

Readiness bands:

- 80-100: Strong candidate.
- 60-79: Promising, gaps to close.
- 40-59: Early readiness.
- 0-39: Not yet lender-ready.

### 9.2 Data Completeness Score

Inputs:

- Scope 1 present: +15.
- Scope 2 present: +15.
- Scope 3 present: +15.
- Baseline year present: +15.
- Target year present: +15.
- Reduction target present: +15.
- Assurance status known: +10.

Cap at 100.

### 9.3 SLL Fit Score

Inputs:

- Material KPI available: +20.
- Baseline year available: +15.
- Target year available: +15.
- Quantified reduction target: +20.
- Third-party assurance: +10.
- Multi-year emissions data or trend: +10.
- Carbon credit strategy can support residual emissions: +10.

Cap at 100.

### 9.4 Green Loan Fit Score

Inputs:

- At least one green project detected: +25.
- Project category likely eligible: +20.
- Capex or financing need identified: +15.
- Impact metric available: +15.
- Reporting process described: +10.
- Proceeds tracking described: +10.
- External review/assurance available: +5.

Cap at 100.

### 9.5 Carbon Credit Opportunity Score

Inputs:

- Emissions data available: +20.
- Target gap can be estimated: +25.
- Residual emissions exist: +20.
- Existing internal reduction plan exists: +15.
- Scope 3 is material or missing: +10.
- Existing credit usage or offset disclosure exists: +10.

Cap at 100.

## 10. Carbon Credit Estimation Logic

Prototype should use a simple rules-based approach.

### 10.1 If Target Data Is Available

Inputs:

- Baseline emissions.
- Current emissions.
- Reduction target percent.
- Target year.

Formula:

`target_emissions = baseline_emissions * (1 - reduction_target_percent / 100)`

`gap = max(current_emissions - target_emissions, 0)`

Suggested credit range:

- Low: 50% of gap.
- High: 100% of gap.

This expresses that credits may support residual emissions, not automatically offset the entire gap.

### 10.2 If Target Data Is Missing

Use proxy:

- Low credit need: 5% of total reported Scope 1 and Scope 2 emissions.
- High credit need: 15% of total reported Scope 1 and Scope 2 emissions.

If Scope 3 is available and material, show separate warning:

"Scope 3 emissions appear material. Further analysis is needed before estimating full value-chain credit needs."

### 10.3 Indicative Credit Pricing

Prototype default:

- Low: USD 8/tCO2e.
- Base: USD 15/tCO2e.
- High: USD 30/tCO2e.

Make this configurable in code.

## 11. Savings Simulation Logic

Default scenarios:

```ts
const scenarios = [
  { label: "conservative", bpsReduction: 5 },
  { label: "base", bpsReduction: 10 },
  { label: "upside", bpsReduction: 15 },
];
```

Formula:

```ts
grossSavings = loanSize * (bpsReduction / 10000) * loanTermYears;
estimatedCreditCost = selectedCreditVolume * selectedCreditPrice;
netBenefit = grossSavings - estimatedCreditCost;
```

For prototype:

- Use midpoint of suggested credit volume.
- Use base credit price unless scenario-specific pricing is implemented.

## 12. ESG Extraction Requirements

### 12.1 Minimum Prototype Extraction

Extract or infer:

- Company name.
- Reporting year.
- Scope 1 emissions.
- Scope 2 emissions.
- Scope 3 emissions.
- Reduction target.
- Target year.
- Baseline year.
- Renewable energy percentage.
- Assurance or verification language.
- Carbon credit / offset mentions.
- Green project mentions.

### 12.2 Extraction Approach

Acceptable prototype approaches:

- PDF text extraction plus regex/rules.
- LLM extraction into the `ExtractedESGMetrics` schema.
- Manual data entry with sample prefilled values.

The engineer may mock extraction initially, but the UI should preserve the review/edit step.

### 12.3 Confidence

Each extracted field should include:

- Value.
- Confidence.
- Source snippet if available.

For prototype, source snippets are helpful but not mandatory.

## 13. UI Requirements

### 13.1 Screens

Required screens:

1. Start/upload.
2. Financing inputs.
3. ESG metric review.
4. Analysis loading state.
5. Report result.

Optional:

- Sample company/demo mode.
- Email capture before download.

### 13.2 Visual Style

The product should feel like a professional finance/advisory tool, not a marketing landing page.

Design principles:

- Clean, dense, report-like layout.
- Clear scoring and tables.
- Avoid decorative ESG clichés.
- Carbon credit section should feel commercially important.
- Use restrained colors with good contrast.
- Make report sections easy to export.

### 13.3 Key Components

- File upload component.
- Multi-step form.
- Editable extracted metrics table.
- Readiness score card.
- Green finance fit comparison.
- Gap list.
- Carbon credit recommendation panel.
- Savings scenario table.
- Download report button.
- Consultation CTA.

## 14. Report Download

Prototype options:

- Generate HTML report and use browser print-to-PDF.
- Generate PDF server-side.
- Generate DOCX/PDF later.

For fastest prototype:

- Render report as a print-friendly HTML page.
- Add `Download / Print PDF` using `window.print()`.

## 15. Example API Shape

### 15.1 Upload

`POST /api/reports/upload`

Input:

- File.

Output:

```json
{
  "uploadId": "string",
  "extractedTextPreview": "string"
}
```

### 15.2 Extract Metrics

`POST /api/reports/extract`

Input:

```json
{
  "uploadId": "string"
}
```

Output:

```json
{
  "metrics": {},
  "confidence": "medium",
  "missingFields": []
}
```

### 15.3 Analyze

`POST /api/reports/analyze`

Input:

```json
{
  "companyProfile": {},
  "financingInputs": {},
  "extractedMetrics": {}
}
```

Output:

```json
{
  "generatedReport": {}
}
```

### 15.4 Download Report

`GET /api/reports/:id/download`

Output:

- PDF or HTML.

For frontend-only prototype, these can be local functions instead of real API routes.

## 16. Validation Rules

Required before analysis:

- Company name.
- Industry.
- Geography.
- Loan size.
- Loan term.

At least one of:

- Scope 1 emissions.
- Scope 2 emissions.
- Total emissions.
- Emissions reduction target.
- Green project data.

If insufficient ESG data:

- Still generate a report.
- Mark readiness as low.
- Emphasize data gaps and request consultation.

## 17. Sample Demo Data

Include sample mode for sales/demo.

Example:

- Company: Asia Manufacturing Co.
- Industry: Manufacturing.
- Geography: Hong Kong / Singapore.
- Loan size: USD 50,000,000.
- Term: 5 years.
- Baseline year: 2023.
- Current Scope 1: 20,000 tCO2e.
- Current Scope 2: 30,000 tCO2e.
- Scope 3: unavailable.
- Target: 25% reduction by 2030.
- Renewable energy: 20%.
- Assurance: limited assurance.
- Green projects: rooftop solar, energy efficiency retrofits.

Expected output:

- Recommended route: SLL first, green loan possible for project capex.
- Readiness score: around 60-75.
- Carbon credit need: residual target gap estimate.
- Savings: based on USD 50M loan over 5 years.

## 18. Future Dashboard Compatibility

Do not build the dashboard in V1.

However, store analysis outputs in structured data so V2 can add:

- Portfolio dashboard.
- Scenario controls.
- KPI trend charts.
- Carbon credit inventory planning.
- Lender-readiness task tracker.
- Multi-report comparison.

The report should be a rendering of `GeneratedReport`, not a manually assembled one-off document.

## 19. Security And Privacy Notes

Prototype should:

- Avoid retaining uploaded reports longer than necessary.
- Tell users how uploaded documents are used.
- Avoid exposing raw report text in logs.
- Allow sample/demo mode without upload.

If using an LLM:

- Confirm whether uploaded reports are sent to a third-party API.
- Avoid sending confidential documents without user consent.

## 20. Acceptance Criteria

The prototype is acceptable when:

- A user can upload or demo-load an ESG report.
- A user can review/edit extracted ESG metrics.
- The system generates SLL and green loan fit scores.
- The system identifies data and verification gaps.
- The system estimates indicative carbon credit need and cost.
- The system estimates financing savings across at least three scenarios.
- The final report is readable, borrower-facing, and downloadable/printable.
- The carbon credit recommendation is prominent and commercially compelling.
- The tool does not imply that credits alone make the borrower eligible for green finance.

## 21. Key Implementation Priority

Prioritize the report experience over perfect extraction.

For a prototype, it is acceptable if extraction is partially mocked or manually corrected, as long as the final report convincingly demonstrates the business value:

- Green finance opportunity discovery.
- Carbon credit need/opportunity.
- Estimated financial impact.
- Clear next steps.

