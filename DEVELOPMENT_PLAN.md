# SLL Readiness Tool Development Plan

## 1. Build Direction

Build the first version as an SLL Readiness Tool, using the handoff document as the primary specification. The broader `ENGINEERING_SPEC.md` can become V1.5/V2 scope after the SLL workflow is stable.

The MVP should let a user upload a text-based ESG or sustainability PDF, run an SLL readiness analysis against the five SLLP March 2025 components, and render a one-page advisory report with live financing assumptions.

Use `/Users/ryan/Downloads/SLL Readiness Report — AIIB (1).pdf` as the initial UI/output reference. It is a one-page report and should be treated as the target report experience for the first static build.

## 2. MVP Scope

### In Scope

- PDF upload for ESG, sustainability, or annual reports with ESG sections.
- Scanned/image-only PDF detection with a clear error.
- Stage 1 Anthropic document extraction into the handoff JSON schema.
- Stage 2 scoring and cost-model enrichment.
- Stage 3 one-page HTML report rendering.
- Editable deal assumptions: loan size, tenor, base margin, best/worst ratchet.
- Live calculation updates in the browser.
- Evidence-backed gap analysis with confidence labels.
- Print-to-PDF or browser download flow.
- AIIB worked example validation.

### Out of Scope for MVP

- User accounts.
- Persistent storage of uploaded reports.
- Dashboard views.
- Carbon credit strategy module.
- Green loan screening.
- Lender matching.
- Registry, SPO provider, or bank integrations.
- Formal legal, financial, or verification advice.

## 3. Recommended Architecture

Use a small full-stack app with clearly separated domain logic.

```text
Frontend
  Upload flow
  Deal input controls
  Report preview
  Print/download

Backend/API
  PDF upload validation
  Anthropic extraction call
  JSON repair/retry
  Analysis orchestration

Domain Modules
  sllSchema
  scoring
  costModel
  financialModel
  reportMapper
  demoFixtures
```

Recommended stack:

- Next.js or Vite/React for fast prototype delivery.
- TypeScript throughout.
- Zod for schema validation.
- Anthropic SDK for Stage 1 extraction.
- Client-side JavaScript/React state for live financial updates.
- No database for MVP unless audit trails become required.

## 4. Core Data Flow

1. User uploads a PDF.
2. Backend validates file type and approximate size.
3. Backend sends PDF to Anthropic with the exact extraction prompt from the handoff.
4. Backend validates the returned JSON against the schema.
5. If JSON is malformed, retry once with a strict "valid JSON only" instruction.
6. Scoring module maps maturities to weighted readiness scores.
7. Cost model adds best/worst execution-cost estimates.
8. Frontend renders the one-page report.
9. User adjusts deal assumptions and calculations update live.

## 5. Implementation Phases

### Phase 0: Project Setup

Deliverables:

- App scaffold with TypeScript.
- Basic routing and layout.
- Environment variable support for `ANTHROPIC_API_KEY`.
- Shared types for extraction output, scoring output, cost model, and report view model.
- AIIB fixture added as local demo data.

Acceptance criteria:

- App runs locally.
- Demo report can render from fixture JSON without any API call.

### Phase 1: Report-First Prototype

Build the output experience before perfecting extraction.

Deliverables:

- One-page SLL readiness report matching the prototype intent.
- Static implementation of the AIIB output reference PDF.
- Score cards for the five SLLP components:
  - KPI data history.
  - KPI methodology.
  - Reporting infrastructure.
  - External verification.
  - Strategic alignment.
- Candidate KPI table.
- Gap list with severity, remediation, evidence, and confidence.
- Cost range display.
- Best/worst net saving display.
- Prominent base-margin input with MDB/corporate tooltip.
- Required disclaimers for base margin and indicative execution costs.

Acceptance criteria:

- AIIB fixture renders a high-readiness report.
- The static report mirrors the reference PDF's information hierarchy: header, verdict, net saving range, readiness score, execution cost, breakeven ratchet, component scores, cost-vs-benefit comparison, KPI candidates, gaps, and footer disclaimer.
- Deal parameters update savings, breakeven ratchet, and net benefit instantly.
- Report is print-friendly and usable as a leave-behind.

### Phase 2: Scoring and Cost Model

Deliverables:

- Maturity-to-score mapping:
  - high = 1.0
  - medium = 0.5
  - low = 0.2
  - absent = 0.0
- Weighted readiness calculation:
  - KPI data history: 30%.
  - KPI methodology: 20%.
  - Reporting infrastructure: 25%.
  - External verification: 15%.
  - Strategic alignment: 10%.
- Readiness bands:
  - `>= 0.75`: high.
  - `0.40-0.74`: medium.
  - `< 0.40`: low.
- Cost driver lookup table from the handoff.
- Best-case and worst-case execution cost calculator.
- Low-confidence penalty: add 20% to worst-case cost for affected drivers.

Acceptance criteria:

- AIIB expected readiness is approximately `0.88`.
- AIIB expected total execution cost range is approximately `$125K-$295K` over 5 years with 2 KPIs.
- Unit tests cover scoring, cost ranges, low-confidence penalty, and financial formulas.

### Phase 3: Anthropic Extraction Integration

Deliverables:

- PDF upload API.
- File validation:
  - PDF only for MVP.
  - Recommended 20MB limit.
  - clear error for oversized files.
- Anthropic API call using `claude-sonnet-4-20250514`.
- Exact handoff extraction prompt.
- JSON validation with retry-on-malformed response.
- Source evidence preservation.
- Error states for extraction failure.

Acceptance criteria:

- Text-based PDF can be analyzed end to end.
- Malformed JSON response is retried once.
- Scanned or near-empty PDFs show: "This PDF appears to be a scanned document. Please upload a text-based PDF."
- No raw report text is logged.

### Phase 4: UX Hardening

Deliverables:

- Upload screen with sample/demo option.
- Loading state that explains analysis progress.
- Editable deal input panel.
- Clear confidence indicators.
- Tooltips for:
  - base margin assumptions.
  - indicative execution costs.
  - ratchet range.
  - confidence levels.
- Print stylesheet.
- Browser print/download button.

Acceptance criteria:

- User can complete the flow in under 30 seconds after upload, excluding network variability.
- Report remains readable on desktop and print/PDF.
- Cost estimates are explicitly labeled "indicative estimates."
- Default ratchet range is 2-10 bps, with editable upper range up to 15 bps.

### Phase 5: Validation and QA

Deliverables:

- AIIB end-to-end test case.
- Formula tests:
  - regular interest.
  - SLL interest.
  - execution cost.
  - net saving.
  - breakeven bps.
- Schema validation tests.
- Scanned PDF handling test.
- Manual QA checklist for report print output.

Acceptance criteria:

- AIIB output matches expected readiness, candidate KPIs, gaps, and cost range directionally.
- All financial formulas match the handoff exactly.
- No external frontend dependencies are required in the standalone report except Google Fonts.

## 6. Key Modules to Build

### `schema`

Owns TypeScript types and Zod validators for the Stage 1 extraction JSON.

### `scoring`

Converts component maturity into weighted readiness score and readiness band.

### `costModel`

Maps readiness band to cost-driver ranges and applies KPI count, tenor, and confidence penalties.

### `financialModel`

Implements:

```text
regularInterest = loanSize * (baseMargin / 10000) * tenor
sllInterest = loanSize * ((baseMargin - ratchet) / 10000) * tenor
execCost = setupCost + (verificationCostPerKpiPerYear * kpiCount * tenor) + (reportingCostPerYear * tenor)
netSaving = regularInterest - sllInterest - execCost
breakevenBps = (execCost / (loanSize * tenor)) * 10000
```

### `anthropicExtraction`

Owns prompt construction, PDF upload call, retry behavior, and response normalization.

### `reportMapper`

Transforms enriched analysis JSON into the one-page UI view model.

## 7. Suggested Task Backlog

1. Scaffold app and shared TypeScript types.
2. Build static report from AIIB fixture.
3. Implement financial model and live input controls.
4. Implement scoring and readiness bands.
5. Implement cost model and confidence penalty.
6. Add unit tests for all domain logic.
7. Add upload screen and demo mode.
8. Integrate Anthropic extraction API.
9. Add schema validation and JSON retry.
10. Add scanned-PDF detection.
11. Add print/download styling.
12. Run AIIB end-to-end validation.
13. Polish UI copy, disclaimers, and tooltips.

## 8. Main Risks

### Extraction Quality

LLM extraction may miss evidence, misread page context, or return malformed JSON. Mitigate with strict schema validation, retry, fixture tests, and visible confidence labels.

### PDF Format Variability

Scanned or layout-heavy PDFs may fail. Mitigate with empty-text detection and a clear manual/sample fallback.

### Financial Assumption Sensitivity

Default margins and ratchets can mislead users. Mitigate with prominent editable inputs, lower default ratchet range, and explicit disclaimers.

### Overbuilding V1

The local engineering spec includes green loans and carbon credits, but the handoff is a focused SLL tool. Mitigate by shipping the SLL report first and preserving structured outputs for future modules.

## 9. Future Expansion Path

After the MVP works, extend toward the broader ESG-to-green-finance prototype:

- Add manual extraction review/edit screen.
- Add green loan opportunity screening.
- Add carbon credit estimation and strategy section.
- Add three-scenario savings simulation for credits.
- Add consultation lead capture.
- Add downloadable generated report storage.
- Add portfolio/dashboard features only after the report workflow proves useful.

## 10. Definition of Done for MVP

The MVP is done when a user can upload a text-based ESG PDF or select the AIIB demo, receive a traceable SLL readiness report, adjust loan assumptions, see best/worst net savings update live, and print/download a polished one-page output with all required disclaimers.
