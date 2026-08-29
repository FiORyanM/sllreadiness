import PdfPrinter from "pdfmake";
import virtualFonts from "pdfmake/build/vfs_fonts.js";
import { calculateScenario, dollars, loanMillions, signedDollars } from "./models/financialModel.js";

const colors = Object.freeze({
  ink: "#17212B",
  muted: "#667481",
  line: "#D9E0E5",
  panel: "#F8FAF9",
  white: "#FFFFFF",
  deep: "#153F3A",
  teal: "#1F7A6D",
  tealSoft: "#E6F3EF",
  gold: "#B98221",
  goldSoft: "#FFF4DD",
  redSoft: "#F8E8E5",
});

const printer = new PdfPrinter({
  Roboto: {
    normal: fontBuffer("Roboto-Regular.ttf"),
    bold: fontBuffer("Roboto-Medium.ttf"),
    italics: fontBuffer("Roboto-Italic.ttf"),
    bolditalics: fontBuffer("Roboto-MediumItalic.ttf"),
  },
});

export class ReportPdfValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReportPdfValidationError";
  }
}

export async function createReportPdfBuffer(rawPayload) {
  const report = normalizeReportPayload(rawPayload);
  const definition = buildReportDefinition(report);
  const document = printer.createPdfKitDocument(definition, { bufferPages: true });
  const chunks = [];

  return new Promise((resolve, reject) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve({
      buffer: Buffer.concat(chunks),
      filename: `${safePdfFilename(report.company.label)}-sll-readiness-report.pdf`,
    }));
    document.on("error", reject);
    document.end();
  });
}

export function normalizeReportPayload(rawPayload) {
  if (!rawPayload || rawPayload.version !== "sll-readiness-report.v1") {
    throw new ReportPdfValidationError("The submitted report payload is invalid or unsupported.");
  }

  const company = rawPayload.company ?? {};
  const verdict = rawPayload.verdict ?? {};
  const analysis = rawPayload.analysis ?? {};
  const deal = rawPayload.deal ?? {};
  const label = cleanText(company.label, 160);
  if (!label) throw new ReportPdfValidationError("The report company name is required.");

  return {
    company: {
      label,
      subtitle: cleanText(company.subtitle, 240),
      generatedDate: cleanText(company.generatedDate, 160),
      footer: cleanText(company.footer, 600),
    },
    verdict: {
      title: cleanText(verdict.title, 300),
      copy: cleanText(verdict.copy, 700),
    },
    deal: normalizeDeal(deal),
    analysis: {
      readinessScore: finiteNumber(analysis.readinessScore, 0, 100, null),
      readinessBand: cleanText(analysis.readinessBand, 160),
      assessmentState: analysis.assessmentState === "assessed" ? "assessed" : "insufficient_evidence",
      executionCost: {
        best: finiteNumber(analysis.executionCost?.best, 0, 100_000_000, 0),
        worst: finiteNumber(analysis.executionCost?.worst, 0, 100_000_000, 0),
      },
      baseMarginNote: cleanText(analysis.baseMarginNote, 1_200),
      analysisScope: normalizeAnalysisScope(analysis.analysisScope),
      components: normalizeItems(analysis.components, normalizeComponent, 10),
      gaps: normalizeItems(analysis.gaps, normalizeGap, 20),
      kpis: normalizeItems(analysis.kpis, normalizeKpi, 20),
    },
  };
}

export function buildReportDefinition(report) {
  const economics = calculateEconomics(report);
  const pageOne = buildSummaryPage(report, economics);
  const pageTwo = buildReadinessAndEconomicsPage(report, economics);
  const pageThree = buildGapsAndKpisPage(report);

  return {
    info: {
      title: `${report.company.label} - SLL Readiness Report`,
      author: "SLL Readiness Tool",
      subject: "Sustainability-linked loan readiness assessment",
      keywords: "SLL, sustainability-linked loan, ESG, readiness",
    },
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [28, 35, 28, 32],
    compress: true,
    tagged: true,
    language: "en",
    defaultStyle: {
      font: "Roboto",
      fontSize: 9.2,
      color: colors.ink,
      lineHeight: 1.16,
    },
    styles: {
      eyebrow: { fontSize: 8.2, bold: true, color: colors.deep },
      reportTitle: { fontSize: 24, bold: true, color: colors.ink },
      sectionTitle: { fontSize: 11.2, bold: true, color: colors.deep },
      cardLabel: { fontSize: 7.8, bold: true, color: colors.teal },
      cardValue: { fontSize: 17, bold: true, color: colors.ink },
      bodyMuted: { fontSize: 8.8, color: colors.muted },
      itemTitle: { fontSize: 10.2, bold: true, color: colors.ink },
      citation: { fontSize: 7.8, color: "#52656C", lineHeight: 1.12 },
      small: { fontSize: 7.8, color: colors.muted },
    },
    header(currentPage) {
      return currentPage === 1
        ? null
        : { text: report.company.label, margin: [28, 14, 28, 0], fontSize: 7.5, color: colors.muted };
    },
    footer(currentPage, pageCount) {
      return {
        columns: [
          { text: "SLL Readiness Report", alignment: "left" },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: "right" },
        ],
        margin: [28, 0, 28, 12],
        fontSize: 7.5,
        color: colors.muted,
      };
    },
    content: [
      ...pageOne,
      { text: "", pageBreak: "before" },
      ...pageTwo,
      { text: "", pageBreak: "before" },
      ...pageThree,
    ],
  };
}

function buildSummaryPage(report, economics) {
  const readinessValue = report.analysis.assessmentState === "assessed"
    ? `${Math.round(report.analysis.readinessScore ?? 0)} / 100`
    : "Not assessed";
  const readinessNote = report.analysis.assessmentState === "assessed"
    ? report.analysis.readinessBand
    : "Insufficient cited evidence";

  return [
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: report.company.label.toUpperCase(), style: "eyebrow" },
            { text: report.company.subtitle, style: "bodyMuted", margin: [0, 5, 0, 0] },
          ],
        },
        {
          width: 280,
          stack: [
            { text: "SLL Readiness Report", style: "reportTitle", alignment: "right" },
            { text: report.company.generatedDate, style: "bodyMuted", alignment: "right", margin: [0, 5, 0, 0] },
          ],
        },
      ],
    },
    horizontalRule([0, 12, 0, 13], colors.deep, 1.5),
    {
      table: {
        widths: [190, 165, 120, 145, 140],
        heights: 132,
        body: [[
          summaryCard("VERDICT", report.verdict.title, report.verdict.copy, colors.tealSoft),
          summaryCard("NET SAVING VS REGULAR LOAN (USD)", `${netSaving(economics.worst.netSaving)} to ${netSaving(economics.best.netSaving)}`, economics.dealSummary, colors.deep, true),
          summaryCard("OVERALL READINESS", readinessValue, readinessNote, colors.panel),
          summaryCard("EST. EXECUTION COST", `${dollars(report.analysis.executionCost.best)} - ${dollars(report.analysis.executionCost.worst)}`, "Best to worst - over tenor", colors.panel),
          summaryCard("BREAKEVEN RATCHET", `${economics.best.breakevenBps.toFixed(1)} - ${economics.worst.breakevenBps.toFixed(1)} bps`, "Minimum bps to recover cost", colors.panel),
        ]],
      },
      layout: borderedLayout(),
    },
    calloutBox("How to interpret this report", [
      "KPI candidates are useful leads to investigate.",
      "Readiness scores and verdicts are not decision-grade.",
      "Gaps prompt diligence; they are not confirmed deficiencies.",
      "Loan economics are illustrative and require actual facility terms and structuring costs.",
    ], [0, 10, 0, 0]),
    report.analysis.baseMarginNote
      ? noteBox([{ text: "Note on base margin: ", bold: true }, report.analysis.baseMarginNote], [0, 7, 0, 0])
      : null,
    analysisScopeBox(report.analysis.analysisScope),
  ].filter(Boolean);
}

function buildReadinessAndEconomicsPage(report, economics) {
  return [{
    table: {
      widths: ["31%", "69%"],
      body: [[
        panelCell("SLLP READINESS BY COMPONENT", buildComponents(report.analysis.components)),
        panelCell("COST VS BENEFIT - REGULAR LOAN VS SLL", buildEconomics(report, economics)),
      ]],
    },
    layout: borderedLayout(),
  }];
}

function buildGapsAndKpisPage(report) {
  return [
    {
      table: {
        widths: ["31%", "69%"],
        body: [[
          panelCell("GAPS TO RESOLVE", buildGaps(report.analysis.gaps)),
          panelCell("CANDIDATE KPIS - IMMEDIATELY AVAILABLE", buildKpis(report.analysis.kpis)),
        ]],
      },
      layout: borderedLayout(),
    },
    horizontalRule([0, 9, 0, 7], colors.line, 0.7),
    { text: report.company.footer, style: "small" },
  ];
}

function summaryCard(label, value, note, fillColor, inverse = false) {
  return {
    fillColor,
    margin: [11, 10, 11, 10],
    stack: [
      { text: label, style: "cardLabel", color: inverse ? "#BFE1D8" : colors.teal },
      { text: value, style: "cardValue", color: inverse ? colors.white : colors.ink, margin: [0, 12, 0, 0] },
      { text: note, style: "bodyMuted", color: inverse ? "#D6EBE5" : colors.muted, margin: [0, 9, 0, 0] },
    ],
  };
}

function panelCell(title, content) {
  return {
    fillColor: colors.panel,
    margin: [12, 11, 12, 12],
    stack: [
      { text: title, style: "sectionTitle", margin: [0, 0, 0, 11] },
      ...content,
    ],
  };
}

function buildComponents(components) {
  if (!components.length) return [{ text: "No evidence-backed component assessments were available.", style: "bodyMuted" }];
  return components.map((component, index) => ({
    unbreakable: true,
    margin: [0, index ? 9 : 0, 0, 0],
    stack: [
      {
        columns: [
          { text: component.name, style: "itemTitle", width: "*" },
          { text: component.score === null ? "-" : `${Math.round(component.score)}%`, bold: true, fontSize: 14, color: colors.deep, width: 42, alignment: "right" },
          { text: component.status, style: "small", bold: true, width: 48, alignment: "right" },
        ],
      },
      progressBar(component.score),
      ...citationBlocks(component.citations),
    ],
  }));
}

function buildEconomics(report, economics) {
  const deal = report.deal;
  return [
    {
      table: {
        widths: ["*", "*", "*", "*", "*"],
        body: [[
          assumptionCell("Loan (USD $M)", formatNumber(deal.loanSizeM)),
          assumptionCell("Tenor (yr)", deal.tenor),
          assumptionCell("Base margin (bps)", deal.baseMargin),
          assumptionCell("Ratchet best", deal.ratchetBest),
          assumptionCell("Ratchet worst", deal.ratchetWorst),
        ]],
      },
      layout: spacedLayout(),
      margin: [0, 0, 0, 10],
    },
    {
      columns: [
        loanBox("REGULAR LOAN", [
          ["Loan size", loanMillions(deal.loanSizeM)],
          ["x base margin", `${deal.baseMargin} bps`],
          ["x tenor", `${deal.tenor} yrs`],
          ["Execution cost", "$0"],
          ["Total outlay", dollars(economics.best.regularInterest), true],
        ], colors.white),
        { text: "VS", width: 35, alignment: "center", bold: true, color: colors.muted, margin: [0, 68, 0, 0] },
        loanBox("SLL BEST CASE", [
          ["Loan size", loanMillions(deal.loanSizeM)],
          ["x reduced margin", `${Math.max(deal.baseMargin - deal.ratchetBest, 0)} bps (-${deal.ratchetBest})`],
          ["x tenor", `${deal.tenor} yrs`],
          ["+ execution cost", dollars(report.analysis.executionCost.best)],
          ["Total outlay", dollars(economics.best.totalOutlay), true],
        ], colors.white),
      ],
      columnGap: 8,
    },
    {
      columns: [
        scenarioBox("BEST CASE", deal.ratchetBest, economics.best, report.analysis.executionCost.best, colors.tealSoft),
        scenarioBox("WORST CASE", deal.ratchetWorst, economics.worst, report.analysis.executionCost.worst, colors.goldSoft),
      ],
      columnGap: 8,
      margin: [0, 8, 0, 0],
    },
  ];
}

function buildGaps(gaps) {
  if (!gaps.length) {
    return [{ text: "No evidence-backed gaps were identified. This does not confirm SLL readiness; uncited matters are withheld rather than guessed.", style: "bodyMuted" }];
  }
  return gaps.map((gap, index) => itemWithBadge({
    title: gap.title,
    body: gap.description,
    badge: gap.severity,
    badgeFill: gap.severity.toLowerCase() === "low" ? colors.tealSoft : colors.goldSoft,
    citations: gap.citations,
    addRule: index > 0,
  }));
}

function buildKpis(kpis) {
  if (!kpis.length) return [{ text: "No evidence-backed KPI candidates were available.", style: "bodyMuted" }];
  return kpis.map((kpi, index) => itemWithBadge({
    title: kpi.name,
    body: kpi.evidence,
    badge: kpi.status,
    badgeFill: kpi.status.toLowerCase() === "ready" ? colors.tealSoft : colors.goldSoft,
    citations: kpi.citations,
    addRule: index > 0,
  }));
}

function itemWithBadge({ title, body, badge, badgeFill, citations, addRule }) {
  return {
    unbreakable: true,
    margin: [0, addRule ? 10 : 0, 0, 0],
    stack: [
      addRule ? horizontalRule([0, 0, 0, 9], colors.line, 0.6, 200) : null,
      {
        columns: [
          { text: title, style: "itemTitle", width: "*" },
          badgeCell(badge, badgeFill),
        ],
      },
      { text: body, style: "bodyMuted", margin: [0, 4, 0, 0] },
      ...citationBlocks(citations),
    ].filter(Boolean),
  };
}

function assumptionCell(label, value) {
  return {
    margin: [7, 6, 7, 7],
    stack: [
      { text: label, style: "small", bold: true },
      { text: String(value), bold: true, margin: [0, 6, 0, 0] },
    ],
  };
}

function loanBox(label, rows, fillColor) {
  return {
    width: "*",
    table: {
      widths: ["*", "auto"],
      body: [
        [{ text: label, colSpan: 2, bold: true, fontSize: 8.2, fillColor: colors.tealSoft, color: colors.deep, margin: [7, 5] }, {}],
        ...rows.map(([name, value, total]) => [
          { text: name, style: total ? "itemTitle" : "bodyMuted", margin: [7, total ? 7 : 5, 3, 5] },
          { text: value, bold: true, fontSize: total ? 11.5 : 9.2, alignment: "right", margin: [3, total ? 7 : 5, 7, 5] },
        ]),
      ],
    },
    fillColor,
    layout: lightTableLayout(),
  };
}

function scenarioBox(label, ratchet, scenario, executionCost, fillColor) {
  return {
    width: "*",
    table: {
      widths: ["*", "auto"],
      body: [
        [{ text: `${label} - ${ratchet}BPS`, colSpan: 2, bold: true, fontSize: 8.2, margin: [7, 5], color: colors.deep }, {}],
        [rowLabel("Regular outlay"), rowValue(dollars(scenario.regularInterest))],
        [rowLabel("- SLL interest"), rowValue(dollars(scenario.sllInterest))],
        [rowLabel("- Execution cost"), rowValue(dollars(executionCost))],
        [{ text: "NET SAVING", color: colors.teal, fontSize: 12, margin: [7, 7, 3, 5] }, { text: signedDollars(scenario.netSaving), color: colors.teal, bold: true, fontSize: 12, alignment: "right", margin: [3, 7, 7, 5] }],
        [{ text: `${dollars(scenario.regularInterest)} - ${dollars(scenario.sllInterest)} - ${dollars(executionCost)}`, colSpan: 2, style: "small", margin: [7, 4, 7, 7] }, {}],
      ],
    },
    fillColor,
    layout: lightTableLayout(),
  };
}

function rowLabel(value) {
  return { text: value, style: "bodyMuted", margin: [7, 5, 3, 5] };
}

function rowValue(value) {
  return { text: value, bold: true, alignment: "right", margin: [3, 5, 7, 5] };
}

function badgeCell(text, fillColor) {
  return {
    width: 55,
    table: { widths: ["*"], body: [[{ text, alignment: "center", bold: true, fontSize: 7.8, fillColor, color: colors.deep, margin: [5, 3] }]] },
    layout: "noBorders",
  };
}

function progressBar(score) {
  const normalized = score === null ? 0 : Math.max(0, Math.min(100, score));
  const fullWidth = 172;
  return {
    table: {
      widths: [Math.max(1, fullWidth * normalized / 100), Math.max(1, fullWidth * (100 - normalized) / 100)],
      heights: 5,
      body: [[{ text: "", fillColor: colors.teal }, { text: "", fillColor: "#DFE7E4" }]],
    },
    layout: "noBorders",
    margin: [0, 4, 0, 5],
  };
}

function citationBlocks(citations) {
  return citations.map((citation) => ({
    text: [
      { text: "Source: ", bold: true, color: colors.deep },
      `"${citation.quote}" - PDF p. ${citation.pages.join(", ")}`,
    ],
    style: "citation",
    margin: [0, 3, 0, 0],
  }));
}

function calloutBox(title, items, margin) {
  return {
    table: {
      widths: ["*"],
      body: [[{
        fillColor: colors.goldSoft,
        margin: [10, 8, 10, 8],
        stack: [
          { text: title, bold: true, color: "#5D4520", margin: [0, 0, 0, 5] },
          { ul: items, color: "#5D4520", fontSize: 8.5, margin: [4, 0, 0, 0] },
        ],
      }]],
    },
    layout: accentLayout(colors.gold),
    margin,
  };
}

function noteBox(text, margin) {
  return {
    table: { widths: ["*"], body: [[{ text, fillColor: colors.goldSoft, color: "#5D4520", margin: [10, 7, 10, 7], fontSize: 8.5 }]] },
    layout: accentLayout(colors.gold),
    margin,
  };
}

function analysisScopeBox(scope) {
  const text = analysisScopeText(scope);
  if (!text) return null;
  return {
    table: { widths: ["*"], body: [[{ text, fillColor: "#F4F7F8", color: "#52656C", margin: [10, 6, 10, 6], fontSize: 7.8 }]] },
    layout: borderedLayout(),
    margin: [0, 7, 0, 0],
  };
}

function horizontalRule(margin, color, width, length = 785) {
  return { canvas: [{ type: "line", x1: 0, y1: 0, x2: length, y2: 0, lineColor: color, lineWidth: width }], margin };
}

function borderedLayout() {
  return {
    hLineColor: () => colors.line,
    vLineColor: () => colors.line,
    hLineWidth: () => 0.7,
    vLineWidth: () => 0.7,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

function spacedLayout() {
  return {
    hLineColor: () => colors.line,
    vLineColor: () => colors.line,
    hLineWidth: () => 0.7,
    vLineWidth: () => 0.7,
    paddingLeft: () => 3,
    paddingRight: () => 3,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

function lightTableLayout() {
  return {
    hLineColor: () => colors.line,
    vLineColor: () => colors.line,
    hLineWidth: (index) => index === 0 ? 0.7 : 0.35,
    vLineWidth: () => 0.7,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

function accentLayout(color) {
  return {
    hLineWidth: () => 0.6,
    vLineWidth: (index) => index === 0 ? 2.5 : 0.6,
    hLineColor: () => color,
    vLineColor: (index) => index === 0 ? color : colors.line,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

function calculateEconomics(report) {
  const best = calculateScenario(report.deal, report.deal.ratchetBest, report.analysis.executionCost.best);
  const worst = calculateScenario(report.deal, report.deal.ratchetWorst, report.analysis.executionCost.worst);
  return {
    best,
    worst,
    dealSummary: `USD $${formatNumber(report.deal.loanSizeM)}M - ${report.deal.tenor}yr - ${report.deal.baseMargin}bps base - ${report.deal.ratchetWorst}-${report.deal.ratchetBest}bps ratchet`,
  };
}

function normalizeDeal(deal) {
  const loanSizeM = finiteNumber(deal.loanSizeM, 1, 100_000, 500);
  const ratchetA = finiteNumber(deal.ratchetBest, 0, 15, 12);
  const ratchetB = finiteNumber(deal.ratchetWorst, 0, 15, 5);
  return {
    loanSizeM,
    loanSize: loanSizeM * 1_000_000,
    tenor: finiteNumber(deal.tenor, 1, 30, 5),
    baseMargin: finiteNumber(deal.baseMargin, 1, 1_000, 150),
    ratchetBest: Math.max(ratchetA, ratchetB),
    ratchetWorst: Math.min(ratchetA, ratchetB),
  };
}

function normalizeComponent(item) {
  return {
    name: cleanText(item?.name, 180) || "Unnamed component",
    score: item?.score === null ? null : finiteNumber(item?.score, 0, 100, null),
    status: cleanText(item?.status, 80),
    citations: normalizeCitations(item?.citations),
  };
}

function normalizeGap(item) {
  return {
    title: cleanText(item?.title, 240) || "Unnamed gap",
    description: cleanText(item?.description, 1_200),
    severity: cleanText(item?.severity, 40) || "Medium",
    citations: normalizeCitations(item?.citations),
  };
}

function normalizeKpi(item) {
  return {
    name: cleanText(item?.name, 240) || "Unnamed KPI",
    evidence: cleanText(item?.evidence, 1_200),
    status: cleanText(item?.status, 40) || "Review",
    citations: normalizeCitations(item?.citations),
  };
}

function normalizeItems(items, mapper, limit) {
  return Array.isArray(items) ? items.slice(0, limit).map(mapper) : [];
}

function normalizeCitations(citations) {
  if (!Array.isArray(citations)) return [];
  return citations.slice(0, 5).map((citation) => ({
    quote: cleanText(citation?.quote, 1_200),
    pages: Array.isArray(citation?.pages)
      ? citation.pages.slice(0, 20).map((page) => Math.round(finiteNumber(page, 1, 100_000, 1)))
      : [],
  })).filter((citation) => citation.quote && citation.pages.length);
}

function normalizeAnalysisScope(scope) {
  if (!scope || typeof scope !== "object") return null;
  return {
    fullCoverage: Boolean(scope.fullCoverage),
    analyzedPageCount: finiteNumber(scope.analyzedPageCount, 0, 100_000, 0),
    duplicatePageCount: finiteNumber(scope.duplicatePageCount, 0, 100_000, 0),
    analyzedPages: normalizePages(scope.analyzedPages),
    skippedPages: normalizePages(scope.skippedPages),
    metadataOnlyPages: normalizePages(scope.metadataOnlyPages),
    selectionRule: cleanText(scope.selectionRule, 500),
  };
}

function normalizePages(pages) {
  return Array.isArray(pages)
    ? pages.slice(0, 2_000).map((page) => Math.round(finiteNumber(page, 1, 100_000, 1)))
    : [];
}

function analysisScopeText(scope) {
  if (!scope) return "";
  if (scope.fullCoverage) {
    const duplicateText = scope.duplicatePageCount ? ` (${scope.duplicatePageCount} exact duplicates removed)` : "";
    return `Analysis coverage: all ${scope.analyzedPageCount} unique PDF pages were assessed${duplicateText}.`;
  }
  const metadata = scope.metadataOnlyPages.length ? ` Metadata-only pages: ${formatPageRanges(scope.metadataOnlyPages)}.` : "";
  return `Analysis coverage: assessed pages ${formatPageRanges(scope.analyzedPages)}. Skipped and not assessed: ${formatPageRanges(scope.skippedPages)}.${metadata} Selection rule: ${scope.selectionRule || "not available"}`;
}

function formatPageRanges(pages) {
  if (!pages.length) return "none";
  const ranges = [];
  let start = pages[0];
  let previous = pages[0];
  for (const page of pages.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = page;
    previous = page;
  }
  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return ranges.join(", ");
}

function finiteNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function cleanText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2192/g, " to ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function netSaving(value) {
  return value < 0 ? `-${dollars(Math.abs(value))}` : dollars(value);
}

function safePdfFilename(value) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase() || "company";
}

function fontBuffer(name) {
  return Buffer.from(virtualFonts[name], "base64");
}
